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
  /** The pools `ufvk` has a key for: no other pool's chunks are read. */
  pools: readonly Pool[];
  /** Block height below which nothing is crawled. Absent means full history. */
  birthday?: number;
  state: WalletState;
  /** The chain tip this run started at. */
  tip: number;
  /** Workers a phase may use right now. */
  workers: (phase: SyncPhase) => number;
  /** Note and sent-output ids already held, so a re-read chunk can't double them. */
  applied: Set<string>;
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

/**
 * Each pool's newest chunk at `sizes`, with its segments and setup's end set
 * the first time. A pool the key can't read has none, so progress skips it.
 */
async function prepare(run: ShieldedRun, sizes: TreeSizes) {
  const last = Object.fromEntries(
    POOLS.map((pool) => [pool, lastChunk(sizes[pool])]),
  ) as Record<Pool, number>;
  const { scanned } = run.state.scan;
  for (const pool of POOLS) {
    if (!run.pools.includes(pool)) delete scanned[pool];
  }
  for (const pool of run.pools) {
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
 * every note found or still unspent for a spend. A pool still at `previous`,
 * the last sync's sizes, has nothing new to read.
 */
export async function crawlRecent(
  run: ShieldedRun,
  sizes: TreeSizes,
  previous?: TreeSizes,
) {
  const { state, signal } = run;
  const { scan } = state;
  const last = await prepare(run, sizes);
  let phase: SyncPhase = "catch-up";
  const advance = () => run.onAdvance(progressOf(scan, phase, run.tip));
  const spends = spendChecks(run, advance);
  spends.check(state.notes.filter((n) => n.spend.status !== "spent"));
  let [started, read, skipped] = [Date.now(), 0, 0];
  const onChunk = (pool: Pool) => (result: ChunkWorkerSuccess) => {
    read++;
    skipped += result.skipped ?? 0;
    spends.check(applyChunk(run, pool, result));
    advance();
  };

  for (const pool of run.pools) {
    if (last[pool] < 0 || sizes[pool] === previous?.[pool]) continue;
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
        tried: scan.scanned[pool]!.tried,
      });
      if (signal.aborted) break;
    }
    top.to = last[pool];
  }
  console.log(
    `[sync] catch-up: ${read} chunks in ${secs(started)}, ${skipped} notes skipped as tried`,
  );

  if (!scan.setupDone && !signal.aborted) {
    phase = "setup";
    [started, read] = [Date.now(), 0];
    advance();
    for (const pool of run.pools) {
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
 * History: what setup left above the spam era, then what lies before it; or,
 * as `spam`, the spam era itself. Each in pool order. True once all is read.
 */
export async function crawlHistory(
  run: ShieldedRun,
  sizes: TreeSizes,
  phase: "history" | "spam",
) {
  const { state, signal } = run;
  const { scan } = state;
  await prepare(run, sizes);
  const advance = () => run.onAdvance(progressOf(scan, phase, run.tip));
  const spends = spendChecks(run, advance);
  advance();
  const segments =
    phase === "history" ? (["top", "before"] as const) : (["spam"] as const);
  const left = run.pools.flatMap((pool) =>
    segments.flatMap((segment) => {
      const { from, floor } = scan.scanned[pool]![segment];
      return from > floor
        ? [`${pool} ${SEGMENTS[segment]} ${from - floor}`]
        : [];
    }),
  );
  console.log(`[sync] ${phase} left (chunks): ${left.join(", ") || "none"}`);

  for (const segment of segments) {
    for (const pool of run.pools) {
      const p = scan.scanned[pool]!;
      const [started, from] = [Date.now(), p[segment].from];
      await crawlSegment(run, pool, p[segment], {
        phase,
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
          `[sync] ${phase} ${pool} ${SEGMENTS[segment]}: ${read} chunks in ${secs(started)}`,
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
  { hits, sent, tried }: ChunkWorkerSuccess,
) {
  const p = run.state.scan.scanned[pool]!;
  if (tried && tried.chunk >= (p.tried?.chunk ?? -1)) p.tried = tried;
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
 * Reads the outputs of `txs`, which we authored, in every pool: those paying us
 * become notes, the rest payments. A transaction is marked read once all its
 * chunks are; a failed chunk retries only its transactions next sync.
 */
export async function recoverSends(
  run: ShieldedRun,
  sizes: TreeSizes,
  txs: Map<string, TxLocator>,
) {
  const { scan, blocks } = run.state;
  const done = new Set(scan.sendsRead);
  // One read per chunk: the tip chunk isn't cached, so a read per transaction downloads it again.
  const reads = new Map<
    string,
    { pool: Pool; chunk: number; sends: number[] }
  >();
  const needs = new Map<string, Set<string>>();
  for (const [txId, { height, tx_index }] of txs) {
    const block = blocks.get(height);
    if (done.has(txId) || !block) continue;
    const places = outputPositions(block, tx_index).filter(
      (p) => p.count && run.pools.includes(p.pool),
    );
    // Not indexed yet: try again next sync.
    if (places.some((p) => p.first + p.count > sizes[p.pool])) continue;
    const keys = new Set<string>();
    for (const { pool, first, count } of places) {
      for (let at = first; at < first + count; at++) {
        const chunk = Math.floor(at / CHUNK_SIZE);
        const key = `${pool}:${chunk}`;
        const read = reads.get(key) ?? { pool, chunk, sends: [] };
        read.sends.push(at % CHUNK_SIZE);
        reads.set(key, read);
        keys.add(key);
      }
    }
    needs.set(txId, keys);
  }
  const found: Note[] = [];
  const ok = new Set<string>();
  for (const [key, { pool, chunk, sends }] of reads) {
    if (run.signal.aborted) break;
    try {
      const read = await run.lookups.run({
        ufvk: run.ufvk,
        chunk,
        pool,
        sends,
      });
      found.push(...applyChunk(run, pool, read));
      ok.add(key);
    } catch (err) {
      if (!run.signal.aborted)
        console.error(`[sync] sends read of ${key} failed`, err);
    }
  }
  const read = [...needs].filter(([, keys]) =>
    [...keys].every((k) => ok.has(k)),
  );
  scan.sendsRead = [...done, ...read.map(([txId]) => txId)];
  // The crawl skips these notes once it reaches their chunk, so its spend check would too.
  if (found.length) {
    await checkSpends(found, run.signal);
    run.onFound();
  }
}
