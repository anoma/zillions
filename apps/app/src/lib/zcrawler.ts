/**
 * Note crawler: fetch compact notes from the indexer over a block range and
 * trial-decrypt them against a UFVK to find the wallet's notes and their value.
 *
 * Stateless — no wallet DB, no commitment tree. Work is split into block chunks
 * and fanned out across a pool of workers (each with its own decrypt-only wasm
 * instance), so decryption runs on every core. Hits stream back as chunks land.
 */

import ZcrawlerWorker from "./zcrawler.worker.ts?worker";

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
}

export interface CrawlResult {
  hits: CrawlHit[];
  /** Sum of hit values, in zatoshis. */
  totalValue: number;
}

/** Main → worker: decrypt the notes in `[from, to)`. */
export interface ChunkRequest {
  id: number;
  ufvk: string;
  from: number;
  to: number;
}

/** Worker → main: the hits for a chunk, or an error. */
export type ChunkResponse =
  | { id: number; from: number; to: number; hits: CrawlHit[] }
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

/** Crawl `[start, end)` and return the notes the UFVK owns. */
export function crawlNotes(
  ufvk: string,
  start: number,
  end: number,
  options: CrawlOptions = {},
): Promise<CrawlResult> {
  const chunkSize = options.chunk ?? 100;
  const chunks: Array<[number, number]> = [];
  for (let from = start; from < end; from += chunkSize) {
    chunks.push([from, Math.min(end, from + chunkSize)]);
  }
  const totalBlocks = Math.max(0, end - start);
  const poolSize = Math.max(
    1,
    Math.min(
      options.workers ?? navigator.hardwareConcurrency ?? 4,
      chunks.length,
    ),
  );

  return new Promise<CrawlResult>((resolve, reject) => {
    const hits: CrawlHit[] = [];
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
      resolve({ hits, totalValue: hits.reduce((n, h) => n + h.value, 0) });
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
        hits.push(...msg.hits);
        scannedBlocks += msg.to - msg.from;
        options.onProgress?.([...hits], scannedBlocks, totalBlocks);
        feed(w);
      };
      w.onerror = (e) => fail(new Error(e.message || "worker error"));
      feed(w);
    }
  });
}
