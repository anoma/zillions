import ZcrawlerWorker from "./worker.ts?worker";

import { SpendLedger } from "./ledger";
import type { ChunkRequest, ChunkResponse, CrawlOptions } from "./types";

/** Tile `[start, end]` into inclusive, non-overlapping `[from, to]` chunks. */
function planChunks(
  start: number,
  end: number,
  size: number,
): Array<[number, number]> {
  const chunks: Array<[number, number]> = [];
  for (let from = start; from <= end; from += size) {
    chunks.push([from, Math.min(end, from + size - 1)]);
  }
  return chunks;
}

/**
 * Crawl `[start, end]` of `pool`, delivering the UFVK's notes via callbacks.
 * Returns a `cancel` fn that stops the crawl (fires no callback).
 */
export function crawlNotes(options: CrawlOptions): () => void {
  const { ufvk, start, end, pool } = options;
  const chunks = planChunks(start, end, options.chunk ?? 100);
  const totalBlocks = Math.max(0, end - start + 1);
  const poolSize = Math.max(
    1,
    Math.min(
      options.workers ?? navigator.hardwareConcurrency ?? 4,
      chunks.length,
    ),
  );

  const ledger = new SpendLedger();
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
    options.onError?.(err);
  };
  const finish = () => {
    if (settled) return;
    settled = true;
    cleanup();
    options.onComplete?.(ledger.result());
  };
  // Stop the crawl without firing onComplete/onError — the caller asked for it.
  const cancel = () => {
    if (settled) return;
    settled = true;
    cleanup();
  };

  // Hand a worker its next chunk, or retire it when the queue is drained.
  const feed = (w: Worker) => {
    if (nextChunk >= chunks.length) {
      running -= 1;
      if (running === 0) finish();
      return;
    }
    const id = nextChunk++;
    const [from, to] = chunks[id];
    w.postMessage({ id, ufvk, pool, from, to } satisfies ChunkRequest);
  };

  // TODO a stalled/errored worker blocks the fold frontier: `pending` grows
  // unbounded and the crawl never finishes. Needs per-chunk timeout/retry.
  for (let i = 0; i < poolSize; i++) {
    const w = new ZcrawlerWorker();
    workers.push(w);
    running += 1;
    w.onmessage = (e: MessageEvent<ChunkResponse>) => {
      const msg = e.data;
      if ("error" in msg) return fail(new Error(msg.error));
      ledger.accept(msg.id, { hits: msg.hits, spends: msg.spends });
      scannedBlocks += msg.to - msg.from + 1;
      const { unspent, buffered } = ledger.stats;
      console.log(
        `[zcrawler] unspent: ${unspent} nf · ${((unspent * 32) / 1024).toFixed(2)} KB · buffered ${buffered}`,
      );
      options.onProgress?.([...ledger.hits], scannedBlocks, totalBlocks);
      feed(w);
    };
    w.onerror = (e) => fail(new Error(e.message || "worker error"));
    feed(w);
  }

  return cancel;
}
