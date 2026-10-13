/**
 * The shielded sync: each pool's chunks newest-first, the notes and sends
 * they hold for us, and where our notes were spent. It updates the state it
 * is given in place; the wallet saves and announces through the callbacks.
 */

import {
  CHUNK_SIZE,
  firstChunkFrom,
  lastChunk,
  type TreeSizes,
} from "../chain/indexer";
import { outputPositions } from "../chain/lightwalletd";
import { SETUP_CHUNKS } from "../config";
import type {
  ChunkWorkerSuccess,
  Note,
  Pool,
  Segment,
  SentOutput,
  TxLocator,
  WalletState,
} from "../types";
import { crawlChunks, workerChannel } from "./crawl";
import {
  newPoolScan,
  POOLS,
  progressOf,
  type SyncPhase,
  type SyncProgress,
} from "./phases";
import { checkSpends } from "./spends";

/** One run of shielded work, over `state`. */
export type ShieldedRun = {
  ufvk: string;
  /** Block height below which nothing is crawled. Absent means full history. */
  birthday?: number;
  state: WalletState;
  /** The chain tip this run started at. */
  tip: number;
  /** Workers a phase may use right now. */
  workers: (phase: SyncPhase) => number;
  /** Note and sent-output ids already held, so a re-read chunk can't double them. */
  applied: Set<string>;
  /** Chunks read in full this run, as `pool:chunk`: their sends are in. */
  readChunks: Set<string>;
  lookups: ReturnType<typeof workerChannel>;
  signal: AbortSignal;
  /** New notes, sends or spends: their blocks are worth fetching now. */
  onFound: () => void;
  /** The cursors or what's known moved: worth saving and announcing. */
  onAdvance: (progress: SyncProgress) => void;
};

const secs = (since: number) => `${((Date.now() - since) / 1000).toFixed(1)} s`;

const SEGMENTS = {
  top: "after the spam era",
  before: "before the spam era",
  spam: "the spam era",
} as const;

const id = (state: WalletState, pool: Pool, position: number) =>
  `${state.id}_${pool}_${position}`;

function applySent(run: ShieldedRun, pool: Pool, sent: SentOutput[]) {
  for (const out of sent) {
    const outId = id(run.state, pool, out.position);
    if (run.applied.has(outId)) continue;
    run.applied.add(outId);
    run.state.sent.push({ ...out, id: outId });
  }
}

/** Each pool's newest chunk at `sizes`, with its segments and setup's end set the first time. */
async function prepare(run: ShieldedRun, sizes: TreeSizes) {
  const last = Object.fromEntries(
    POOLS.map((pool) => [pool, lastChunk(sizes[pool])]),
  ) as Record<Pool, number>;
  const { scanned } = run.state.scan;
  for (const pool of POOLS) {
    if (!scanned[pool]) {
      const birthday = run.birthday
        ? await firstChunkFrom(pool, run.birthday, Math.max(last[pool], 0))
        : 0;
      scanned[pool] = newPoolScan(pool, last[pool], birthday);
    }
    const p = scanned[pool];
    if (p.setup === undefined) {
      p.setup = Math.max(p.top.floor, SETUP_CHUNKS[pool]);
      console.log(`[sync] setup ends at ${pool} chunk ${p.setup}`);
    }
  }
  return last;
}

/**
 * Spend checks for the notes a crawl finds, chained off it: its `onChunk`
 * must stay synchronous. A failed check retries next sync.
 */
function spendChecks(run: ShieldedRun, advance: () => void) {
  let checking: Promise<unknown> = Promise.resolve();
  return {
    check: (notes: Note[]) => {
      if (!notes.length) return;
      checking = checking
        .then(() => checkSpends(notes, run.signal))
        .then(() => {
          run.onFound();
          advance();
        })
        .catch((err) => console.error("[sync] spend check failed", err));
    },
    done: () => checking,
  };
}

/** Reads `segment` down to its floor, newest first, moving its cursor chunk by chunk. */
function crawlSegment(
  run: ShieldedRun,
  pool: Pool,
  segment: Segment,
  options: {
    phase: SyncPhase;
    signal?: AbortSignal;
    onChunk: (result: ChunkWorkerSuccess) => void;
  },
) {
  return crawlChunks({
    ufvk: run.ufvk,
    pool,
    from: segment.floor,
    to: segment.from - 1,
    signal: options.signal ?? run.signal,
    workers: () => run.workers(options.phase),
    onChunk: (result) => {
      segment.from = result.chunk;
      options.onChunk(result);
    },
  });
}

/**
 * Catch-up, then setup until it's done: the chunks minted since the last
 * sync, then, the first time, each pool down to where setup ends. Checks
 * every note found or still unspent for a spend.
 */
export async function crawlRecent(run: ShieldedRun, sizes: TreeSizes) {
  const { state, signal } = run;
  const { scan } = state;
  const last = await prepare(run, sizes);
  let phase: SyncPhase = "catch-up";
  const advance = () => run.onAdvance(progressOf(scan, phase, run.tip));
  const spends = spendChecks(run, advance);
  spends.check(state.notes.filter((n) => n.spend.status !== "spent"));
  let [started, read] = [Date.now(), 0];
  const onChunk = (pool: Pool) => (result: ChunkWorkerSuccess) => {
    read++;
    spends.check(applyChunk(run, pool, result));
    advance();
  };

  for (const pool of POOLS) {
    if (last[pool] < 0) continue;
    const { top } = scan.scanned[pool]!;
    if (top.from > top.to) {
      top.from = last[pool] + 1;
    } else {
      // Down to the last sync's newest chunk again: it may have been filling.
      await crawlChunks({
        ufvk: run.ufvk,
        pool,
        from: top.to,
        to: last[pool],
        signal,
        workers: () => run.workers(phase),
        onChunk: onChunk(pool),
      });
      if (signal.aborted) break;
    }
    top.to = last[pool];
  }
  console.log(`[sync] catch-up: ${read} chunks in ${secs(started)}`);

  if (!scan.setupDone && !signal.aborted) {
    phase = "setup";
    [started, read] = [Date.now(), 0];
    advance();
    for (const pool of POOLS) {
      if (last[pool] < 0) continue;
      const p = scan.scanned[pool]!;
      await crawlSegment(
        run,
        pool,
        { ...p.top, floor: p.setup! },
        {
          phase,
          onChunk: (result) => {
            p.top.from = result.chunk;
            if (result.minHeight !== undefined)
              p.oldestHeight = result.minHeight;
            onChunk(pool)(result);
          },
        },
      );
      if (signal.aborted) break;
    }
    if (!signal.aborted) {
      scan.setupDone = true;
      console.log(`[sync] setup done: ${read} chunks in ${secs(started)}`);
    }
  }
  await spends.done();
  advance();
}

/**
 * History: what setup left above the spam era, then what lies before it,
 * then the spam era itself, each in pool order. True once all of it is read.
 */
export async function crawlHistory(run: ShieldedRun, sizes: TreeSizes) {
  const { state, signal } = run;
  const { scan } = state;
  await prepare(run, sizes);
  const advance = () => run.onAdvance(progressOf(scan, "history", run.tip));
  const spends = spendChecks(run, advance);
  advance();
  const left = POOLS.flatMap((pool) =>
    (["top", "before", "spam"] as const).flatMap((segment) => {
      const { from, floor } = scan.scanned[pool]![segment];
      return from > floor
        ? [`${pool} ${SEGMENTS[segment]} ${from - floor}`]
        : [];
    }),
  );
  console.log(`[sync] history left (chunks): ${left.join(", ") || "none"}`);

  for (const segment of ["top", "before", "spam"] as const) {
    for (const pool of POOLS) {
      const p = scan.scanned[pool]!;
      const [started, from] = [Date.now(), p[segment].from];
      await crawlSegment(run, pool, p[segment], {
        phase: "history",
        onChunk: (result) => {
          if (segment === "top" && result.minHeight !== undefined) {
            p.oldestHeight = result.minHeight;
          }
          spends.check(applyChunk(run, pool, result));
          advance();
        },
      });
      if (from > p[segment].from) {
        const read = from - p[segment].from;
        console.log(
          `[sync] history ${pool} ${SEGMENTS[segment]}: ${read} chunks in ${secs(started)}`,
        );
      }
      if (signal.aborted) return false;
    }
  }
  await spends.done();
  advance();
  return !signal.aborted;
}

/** Takes one chunk's notes and sends; returns the notes new to us. */
function applyChunk(
  run: ShieldedRun,
  pool: Pool,
  { chunk, hits, sent }: ChunkWorkerSuccess,
) {
  // A worker reads a chunk in full exactly when it holds a note of ours.
  if (hits.length) run.readChunks.add(`${pool}:${chunk}`);
  const known = run.applied.size;
  applySent(run, pool, sent);
  const found: Note[] = [];
  for (const hit of hits) {
    const note: Note = {
      ...hit,
      id: id(run.state, pool, hit.position),
      spend: { status: "unchecked" },
    };
    if (run.applied.has(note.id)) continue;
    run.applied.add(note.id);
    run.state.notes.push(note);
    found.push(note);
  }
  // History shows a find at once; its txid and time can't wait for the crawl's end.
  if (run.applied.size > known) run.onFound();
  return found;
}

/**
 * Reads what `txs`, our own transactions, sent, in every pool they pay into:
 * the crawl only reads chunks holding a note or spend of ours, but a payment
 * can sit in another pool's chunk. Its block says exactly where.
 */
export async function recoverSends(
  run: ShieldedRun,
  sizes: TreeSizes,
  txs: Map<string, TxLocator>,
) {
  const { scan, blocks } = run.state;
  const done = new Set(scan.sendsRead);
  try {
    for (const [txId, { height, tx_index }] of txs) {
      const block = blocks.get(height);
      if (done.has(txId) || !block) continue;
      const places = outputPositions(block, tx_index).filter((p) => p.count);
      // Not indexed yet: try again next sync.
      if (places.some((p) => p.first + p.count > sizes[p.pool])) continue;
      for (const { pool, first, count } of places) {
        const from = Math.floor(first / CHUNK_SIZE);
        const to = Math.floor((first + count - 1) / CHUNK_SIZE);
        for (let chunk = from; chunk <= to; chunk++) {
          if (run.readChunks.has(`${pool}:${chunk}`)) continue;
          const { sent } = await run.lookups.run({
            ufvk: run.ufvk,
            chunk,
            pool,
            sends: true,
          });
          applySent(run, pool, sent);
          run.readChunks.add(`${pool}:${chunk}`);
        }
      }
      done.add(txId);
    }
  } finally {
    scan.sendsRead = [...done];
  }
}
