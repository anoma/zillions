/**
 * The shielded sync: each pool's chunks oldest-first, the notes and sends
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
import type {
  ChunkWorkerSuccess,
  Note,
  Pool,
  SentOutput,
  ShieldedScan,
  TxLocator,
  WalletState,
} from "../types";
import { crawlChunks, workerChannel } from "./crawl";
import {
  checkSaplingSpends,
  findSpends,
  markUnspent,
  placeSpends,
} from "./spends";

/** Newest pool first: that's where recent activity lands. */
export const POOLS = [
  "ironwood",
  "orchard",
  "sapling",
] as const satisfies Pool[];

/** Each pool's last chunk, possibly still filling; -1 for an empty pool. */
export type LastChunks = Record<Pool, number>;

/** How much of the chunks from each pool's start to `last` is read, 0 to 100. */
export function percentageOf(
  scanned: ShieldedScan["scanned"],
  last: LastChunks,
) {
  let [done, total] = [0, 0];
  for (const pool of POOLS) {
    const scan = scanned[pool];
    if (!scan) continue;
    done += Math.max(0, scan.next - scan.start);
    total += Math.max(0, last[pool] + 1 - scan.start);
  }
  return total > 0 ? Math.min(100, (done / total) * 100) : 100;
}

/** One sync's shielded work, over `state`. */
export type ShieldedRun = {
  ufvk: string;
  /** Block height below which nothing is crawled. Absent means full history. */
  birthday?: number;
  state: WalletState;
  /** Note and sent-output ids already held, so a re-read chunk can't double them. */
  applied: Set<string>;
  /** Chunks read in full this sync, as `pool:chunk`: their sends are in. */
  readChunks: Set<string>;
  lookups: ReturnType<typeof workerChannel>;
  signal: AbortSignal;
  /** New notes or sends: their blocks are worth fetching now. */
  onFound: () => void;
  /** The cursor or what's known moved: worth saving and announcing. */
  onAdvance: () => void;
};

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
 * Scans each pool oldest-first, from the birthday's chunk (or chunk 0) to the
 * tip, then on later syncs from where it stopped. Every note older than a
 * chunk is known when that chunk is read, so its spends show up in it.
 * `sizes` are the trees' sizes to read up to.
 */
export async function crawlShielded(run: ShieldedRun, sizes: TreeSizes) {
  const { state, signal } = run;
  const last = Object.fromEntries(
    POOLS.map((pool) => [pool, lastChunk(sizes[pool])]),
  ) as LastChunks;
  const { scanned } = state.scan;
  for (const pool of POOLS) {
    if (scanned[pool]) continue;
    const start =
      run.birthday === undefined
        ? 0
        : await firstChunkFrom(pool, run.birthday, last[pool]);
    scanned[pool] = { start, next: start };
  }
  const advance = () => {
    state.scan.percentage = percentageOf(scanned, last);
    run.onAdvance();
  };

  for (const pool of POOLS) {
    if (last[pool] < 0) continue;
    const scan = scanned[pool]!;
    // Each chunk's spend lookup, then its cursor move, chained in chunk
    // order: the cursor never passes a chunk whose spends aren't placed.
    let locating: Promise<unknown> = Promise.resolve();
    await crawlChunks({
      ufvk: run.ufvk,
      pool,
      // The last chunk read may have been the tip, still filling.
      from: Math.max(scan.start, scan.next - 1),
      to: last[pool],
      signal,
      onChunk: (result) => {
        const spends = applyChunk(run, pool, result);
        locating = locating.then(async () => {
          if (spends.length) {
            await locateSpends(run, pool, result.chunk, spends);
          }
          scan.next = Math.max(scan.next, result.chunk + 1);
          advance();
        });
      },
    });
    await locating;
    if (signal.aborted) break;

    if (pool === "sapling") {
      await checkSaplingSpends(state.notes, state.scan, signal);
    } else {
      markUnspent(state.notes, pool);
    }
    advance();
  }
}

/** Takes one chunk's notes and sends; returns its records spending our notes, by index. */
function applyChunk(
  run: ShieldedRun,
  pool: Pool,
  { chunk, hits, sent, body }: ChunkWorkerSuccess,
) {
  // A worker reads a chunk in full exactly when it holds a note of ours.
  if (hits.length) run.readChunks.add(`${pool}:${chunk}`);
  const known = run.applied.size;
  applySent(run, pool, sent);
  for (const hit of hits) {
    const note: Note = {
      ...hit,
      id: id(run.state, pool, hit.position),
      spend: { status: "unchecked" },
    };
    if (run.applied.has(note.id)) continue;
    run.applied.add(note.id);
    run.state.notes.push(note);
  }
  // History shows a find at once; its txid and time can't wait for the crawl's end.
  if (run.applied.size > known) run.onFound();

  // An Orchard or Ironwood action names the nullifier it spends as its rho.
  return pool === "sapling" ? [] : findSpends(run.state.notes, pool, body);
}

/** Places `spends`, records of `chunk`, and takes what the chunk shows we sent. */
async function locateSpends(
  run: ShieldedRun,
  pool: Pool,
  chunk: number,
  spends: number[],
) {
  const result = await run.lookups.run({ ufvk: run.ufvk, chunk, pool, spends });
  run.readChunks.add(`${pool}:${chunk}`);
  applySent(run, pool, result.sent);
  placeSpends(run.state.notes, pool, result.spends);
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
            spends: [],
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
