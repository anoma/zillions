/**
 * Runs a pool's chunks across a bank of decrypt workers: chunks are fetched and
 * decrypted concurrently, but handed to `onChunk` strictly newest-first.
 */

import type {
  ChunkRequest,
  ChunkWorkerResponse,
  ChunkWorkerSuccess,
  Pool,
} from "./types";
import ZcrawlerWorker from "./worker.ts?worker";

/** Wraps a worker as a request/response channel: one chunk in flight at a time. */
function workerChannel() {
  const worker = new ZcrawlerWorker();
  return {
    run: (request: ChunkRequest) =>
      new Promise<ChunkWorkerSuccess>((resolve, reject) => {
        worker.onmessage = ({ data }: MessageEvent<ChunkWorkerResponse>) =>
          "error" in data ? reject(new Error(data.error)) : resolve(data);
        worker.onerror = (e) => reject(new Error(e.message || "worker error"));
        worker.postMessage(request);
      }),
    terminate: () => worker.terminate(),
  };
}

/** Buffers out-of-order results and releases them as the gaps fill in. */
function orderedBuffer<T>(firstIndex: number) {
  const pending = new Map<number, T>();
  let next = firstIndex;

  return (index: number, item: T): T[] => {
    pending.set(index, item);
    const ready: T[] = [];
    while (pending.has(next)) {
      ready.push(pending.get(next)!);
      pending.delete(next);
      next -= 1;
    }
    return ready;
  };
}

export async function crawlChunks(options: {
  ufvk: string;
  pool: Pool;
  /** Inclusive chunk range, crawled downward; a `from < to` range is a no-op. */
  from: number;
  to: number;
  signal?: AbortSignal;
  /** Called once per chunk, in descending chunk order. Must stay synchronous:
   *  an await here would let concurrent workers interleave out of order. */
  onChunk: (result: ChunkWorkerSuccess) => void;
}) {
  const { ufvk, pool, from, to, signal, onChunk } = options;

  const total = from - to + 1;
  if (total <= 0) return;

  const release = orderedBuffer<ChunkWorkerSuccess>(from);
  const channels = Array.from(
    { length: Math.min(navigator.hardwareConcurrency ?? 4, total) },
    workerChannel,
  );

  let nextChunk = from;
  try {
    // ponytail: a hung worker stalls its channel forever; add a per-chunk
    // timeout + retry if the indexer turns out to drop requests.
    await Promise.all(
      channels.map(async (channel) => {
        while (nextChunk >= to && !signal?.aborted) {
          const chunk = nextChunk--;
          release(chunk, await channel.run({ ufvk, chunk, pool })).forEach(
            onChunk,
          );
        }
      }),
    );
  } finally {
    channels.forEach((channel) => channel.terminate());
  }
}
