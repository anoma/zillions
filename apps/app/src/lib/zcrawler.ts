/**
 * Note crawler: fetch compact notes from the indexer over a block range and
 * trial-decrypt them against a UFVK to find the wallet's notes and their value.
 *
 * Stateless — no wallet DB, no commitment tree. Work is split into block chunks
 * and fanned out across a pool of workers (each with its own decrypt-only wasm
 * instance), so decryption runs on every core. Hits stream back as chunks land.
 */

import ZcrawlerWorker from "./zcrawler.worker.ts?worker";

const CRAWLER_URL = import.meta.env.VITE_CRAWLER_URL ?? "http://localhost:8080";

/** Highest block the indexer has data for, to bound a scan. */
export async function getChainTip(): Promise<number> {
  const res = await fetch(`${CRAWLER_URL}/tip`);
  if (!res.ok) throw new Error(`tip: HTTP ${res.status}`);
  const { tip } = (await res.json()) as { tip: number };
  return tip;
}

export interface CrawlHit {
  pool: "sapling" | "orchard";
  /** "external" (received) or "internal" (change). */
  scope: "external" | "internal";
  height: number;
  tx_index: number;
  index: number;
  position: number;
  /** Value in zatoshis. */
  value: number;
  /** This note's own nullifier (hex); shows on-chain when spent. */
  nf_mine: string;
  /** True once this note's nullifier is seen spent in the scanned range. */
  spent?: boolean;
}

export interface CrawlResult {
  hits: CrawlHit[];
  /** Sum of all hit values (gross received), in zatoshis. */
  totalValue: number;
  /** Sum of unspent hit values (net spendable), in zatoshis. */
  netValue: number;
  /** Peak count of owned unspent Orchard notes held during the fold. */
  nullifierSetSize: number;
  /** Logical size of that peak set (32 bytes each), for memory tracking. */
  nullifierSetBytes: number;
}

/** Main → worker: decrypt the notes in `[from, to]` (both bounds inclusive). */
export interface ChunkRequest {
  id: number;
  ufvk: string;
  from: number;
  to: number;
}

/** Worker → main: the hits and Orchard spend nullifiers for a chunk, or an error. */
export type ChunkResponse =
  | { id: number; from: number; to: number; hits: CrawlHit[]; spends: string[] }
  | { id: number; error: string };

export interface CrawlOptions {
  /** Blocks fetched + decrypted per request. Defaults to 100. */
  chunk?: number;
  /** Parallel workers. Defaults to the number of CPU cores. */
  workers?: number;
  /** Fires as each chunk lands, with the cumulative hits so far. */
  onProgress?: (
    hits: CrawlHit[],
    scannedBlocks: number,
    totalBlocks: number,
  ) => void;
  signal?: AbortSignal;
}

// TODO the crawlNotes is a worker orchestrator, revisit this for when cleaning the code
/** Crawl `[start, end]` (both inclusive) and return the notes the UFVK owns. */
export function crawlNotes(
  ufvk: string,
  start: number,
  end: number,
  options: CrawlOptions = {},
): Promise<CrawlResult> {
  const chunkSize = options.chunk ?? 100;
  // The indexer's /notes range is inclusive on both ends, so tile with
  // inclusive, non-overlapping chunks — otherwise adjacent chunks would both
  // fetch the shared boundary block and double-count its notes.
  const chunks: Array<[number, number]> = [];
  for (let from = start; from <= end; from += chunkSize) {
    chunks.push([from, Math.min(end, from + chunkSize - 1)]);
  }
  const totalBlocks = Math.max(0, end - start + 1);
  const poolSize = Math.max(
    1,
    Math.min(
      options.workers ?? navigator.hardwareConcurrency ?? 4,
      chunks.length,
    ),
  );

  return new Promise<CrawlResult>((resolve, reject) => {
    const hits: CrawlHit[] = [];
    // Owned unspent Orchard notes, keyed by their own nullifier. The ordered
    // fold adds a note on receipt and removes it when spent, so this holds only
    // live notes — a spend nullifier that doesn't match one of ours is discarded
    // on sight, never accumulated.
    const unspent = new Map<string, CrawlHit>();
    let peakUnspent = 0;
    // Chunks decrypt in parallel but must fold in block order (a note is created
    // before it's spent), so buffer out-of-order results until their turn.
    // ponytail: the buffer is bounded by in-flight chunks; only one chunk lagging
    // far behind all others would grow it toward the full range.
    const pending = new Map<number, { hits: CrawlHit[]; spends: string[] }>();
    let nextApply = 0;
    let scannedBlocks = 0;
    let nextChunk = 0;
    let running = 0;
    let settled = false;
    const workers: Worker[] = [];

    const cleanup = () => workers.forEach((w) => w.terminate());
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      console.log(
        `[zcrawler] final unspent: ${unspent.size} nf · peak ${peakUnspent}`,
      );
      resolve({
        hits,
        totalValue: hits.reduce((n, h) => n + h.value, 0),
        netValue: hits.reduce((n, h) => n + (h.spent ? 0 : h.value), 0),
        nullifierSetSize: peakUnspent,
        nullifierSetBytes: peakUnspent * 32,
      });
    };

    // Fold one chunk in block order: register its notes, then resolve its spends
    // against the live set — a match frees its note, a non-match is dropped.
    const apply = (chunk: { hits: CrawlHit[]; spends: string[] }) => {
      for (const h of chunk.hits) {
        hits.push(h);
        if (h.pool === "orchard") unspent.set(h.nf_mine, h);
      }
      for (const nf of chunk.spends) {
        const note = unspent.get(nf);
        if (note) {
          note.spent = true;
          unspent.delete(nf);
        }
      }
      peakUnspent = Math.max(peakUnspent, unspent.size);
    };

    if (options.signal?.aborted) return fail(options.signal.reason);
    options.signal?.addEventListener(
      "abort",
      () => fail(options.signal?.reason),
      { once: true },
    );

    // Hand a worker its next chunk, or retire it when the queue is drained.
    const feed = (w: Worker) => {
      if (nextChunk >= chunks.length) {
        running -= 1;
        if (running === 0) finish();
        return;
      }
      const id = nextChunk++;
      const [from, to] = chunks[id];
      const req: ChunkRequest = { id, ufvk, from, to };
      w.postMessage(req);
    };

    for (let i = 0; i < poolSize; i++) {
      const w = new ZcrawlerWorker();
      workers.push(w);
      running += 1;
      w.onmessage = (e: MessageEvent<ChunkResponse>) => {
        const msg = e.data;
        if ("error" in msg) return fail(new Error(msg.error));
        pending.set(msg.id, { hits: msg.hits, spends: msg.spends });
        scannedBlocks += msg.to - msg.from + 1;
        // Fold every chunk that's now contiguous from the frontier, in order.
        while (pending.has(nextApply)) {
          apply(pending.get(nextApply)!);
          pending.delete(nextApply);
          nextApply += 1;
        }
        // Track live memory: the held set (grows/shrinks) and the reorder buffer.
        console.log(
          `[zcrawler] unspent: ${unspent.size} nf · ${(
            (unspent.size * 32) /
            1024
          ).toFixed(2)} KB · buffered ${pending.size}`,
        );
        options.onProgress?.([...hits], scannedBlocks, totalBlocks);
        feed(w);
      };
      w.onerror = (e) => fail(new Error(e.message || "worker error"));
      feed(w);
    }
  });
}
