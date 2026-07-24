/**
 * Note crawler: fetch compact notes from the indexer over a block range and
 * trial-decrypt them against a UFVK to find the wallet's notes and their value.
 *
 * Stateless — no wallet DB, no commitment tree. Work is split into block chunks
 * and fanned out across a pool of workers (each with its own decrypt-only wasm
 * instance), so decryption runs on every core. Hits stream back as chunks land.
 */

import ZcrawlerWorker from "./worker.ts?worker";

import { SpendLedger } from "./ledger";
import type {
  ChunkRequest,
  ChunkResponse,
  CrawlOptions,
  CrawlResult,
} from "./types";

/**
 * Tile `[start, end]` into inclusive, non-overlapping `[from, to]` chunks.
 *
 * The indexer's `/notes` range is inclusive on both ends, so chunks must not
 * share a boundary block — otherwise adjacent chunks double-count its notes.
 */
export function planChunks(
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

/** Crawl `[start, end]` of `pool` (both inclusive) and return the notes the UFVK owns. */
export function crawlNotes(options: CrawlOptions): Promise<CrawlResult> {
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

  return new Promise<CrawlResult>((resolve, reject) => {
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
      reject(err);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(ledger.result());
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
      w.postMessage({ id, ufvk, pool, from, to } satisfies ChunkRequest);
    };

    // TODO handle a worker that errors or stalls far behind its peers. A stuck
    // chunk blocks the fold frontier, so `pending` (the reorder buffer) grows
    // unbounded and the crawl can never `finish`. Need a per-chunk timeout/retry
    // that reassigns the chunk to another worker (or respawns one), so the
    // nullifier set doesn't grow indefinitely and no notes are silently lost.
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
  });
}
