/**
 * Runs a pool's chunks across a bank of decrypt workers: chunks are fetched and
 * decrypted concurrently, but handed to `onChunk` strictly newest-first.
 */

import type {
  ChunkRequest,
  ChunkWorkerResponse,
  ChunkWorkerSuccess,
  Pool,
  Tried,
} from "../types";
import { gpuSecrets } from "./gpu";
import DecryptWorker from "./worker.ts?worker";

/** Wraps a worker as a request/response channel: one chunk in flight at a time. */
export function workerChannel() {
  const worker = new DecryptWorker();
  return {
    run: (request: ChunkRequest) =>
      new Promise<ChunkWorkerSuccess>((resolve, reject) => {
        worker.onmessage = ({ data }: MessageEvent<ChunkWorkerResponse>) => {
          if ("gpuInputs" in data) {
            gpuSecrets(data.pool, data.gpuInputs).then(
              (secrets) =>
                worker.postMessage(
                  { secrets: secrets ?? null },
                  secrets ? [secrets.buffer] : [],
                ),
              (err) => worker.postMessage({ gpuError: String(err) }),
            );
          } else if ("error" in data) reject(new Error(data.error));
          else resolve(data);
        };
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

export const CORES = navigator.hardwareConcurrency ?? 4;

/** `?gpu=off` keeps trial decryption on the CPU, to compare. */
const GPU = new URLSearchParams(location.search).get("gpu") !== "off";

export async function crawlChunks(options: {
  ufvk: string;
  pool: Pool;
  /** Inclusive chunk range, crawled from `to` down to `from`; a `to < from` range is a no-op. */
  from: number;
  to: number;
  signal?: AbortSignal;
  /** How many workers may run now, checked before each chunk; all cores when absent. */
  workers?: () => number;
  /** Called once per chunk, in descending chunk order. Must stay synchronous:
   *  an await here would let concurrent workers interleave out of order. */
  onChunk: (result: ChunkWorkerSuccess) => void;
  /** Notes already tried in one of these chunks, for its read to skip. */
  tried?: Tried;
}) {
  const { ufvk, pool, from, to, signal, workers, onChunk, tried } = options;

  const total = to - from + 1;
  if (total <= 0) return;

  const release = orderedBuffer<ChunkWorkerSuccess>(to);
  const channels: (ReturnType<typeof workerChannel> | undefined)[] = [];

  let nextChunk = to;
  try {
    // ponytail: a hung worker stalls its channel forever; add a per-chunk
    // timeout + retry if the indexer turns out to drop requests.
    await Promise.all(
      Array.from({ length: Math.min(CORES, total) }, async (_, i) => {
        while (nextChunk >= from && !signal?.aborted) {
          if (i >= (workers?.() ?? CORES)) {
            // Over the limit: free this worker's memory, and look again soon.
            channels[i]?.terminate();
            channels[i] = undefined;
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
          }
          const channel = (channels[i] ??= workerChannel());
          const chunk = nextChunk--;
          release(
            chunk,
            await channel.run({ ufvk, chunk, pool, tried, gpu: GPU }),
          ).forEach(onChunk);
        }
      }),
    );
  } finally {
    channels.forEach((channel) => channel?.terminate());
  }
}
