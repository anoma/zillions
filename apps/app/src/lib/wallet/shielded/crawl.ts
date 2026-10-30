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

// Maximum time that a decryption can take in milliseconds
const DECRYPTION_TIMEOUT_MS = 30000;

/**
 * Wraps a worker as a request/response channel: one chunk in flight at a time.
 * Aborting `signal` terminates the worker and rejects the chunk in flight.
 */
export function workerChannel(signal?: AbortSignal) {
  const worker = new DecryptWorker();
  return {
    run: (request: ChunkRequest) => {
      let onAbort = () => {};
      return (
        new Promise<ChunkWorkerSuccess>((resolve, reject) => {
          if (signal?.aborted) return reject(signal.reason);
          onAbort = () => {
            worker.terminate();
            reject(signal!.reason);
          };
          signal?.addEventListener("abort", onAbort, { once: true });
          worker.onmessage = ({ data }: MessageEvent<ChunkWorkerResponse>) => {
            if ("gpuInputs" in data) {
              gpuSecrets(data.pool, data.gpuInputs, signal).then(
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
          worker.onerror = (e) =>
            reject(new Error(e.message || "worker error"));
          worker.postMessage(request);
        })
          // The signal outlives thousands of chunks: drop each one's listener.
          .finally(() => signal?.removeEventListener("abort", onAbort))
      );
    },
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

/** `VITE_GPU_DISABLED=true` keeps trial decryption on the CPU, to compare. */
const GPU = import.meta.env.VITE_GPU_DISABLED !== "true";

// Constructs a promise that is guaranteed to resolve within ms milliseconds regardless
// of whether the given promise has resolved or not.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  // Make promise that rejects in ms milliseconds
  const timeout = new Promise<never>((_, reject) => {
    // Wait ms milliseconds
    setTimeout(() => {
      // Then reject the promise
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);
  });
  // Make promise that evaluates to either the timeout or the given promise;
  // whichever evaluates sooner.
  return Promise.race([promise, timeout]);
}

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
          // Grab the next pending chunk
          const chunk = nextChunk--;
          // Repeatedly attempt to decrypt chunk until successful
          for (;;) {
            // Ensure that the worker for decrypting the current chunk is initialized
            const channel = (channels[i] ??= workerChannel(signal));
            try {
              // Start decrypting this chunk
              const decryptionPromise = channel.run({
                ufvk,
                chunk,
                pool,
                tried,
                gpu: GPU,
              });
              // Add timeout to the decryption to  prevent hanging
              const delimitedDecryptionPromise = withTimeout(
                decryptionPromise,
                DECRYPTION_TIMEOUT_MS,
              );
              // Release the decrypted chunks in order
              release(chunk, await delimitedDecryptionPromise).forEach(onChunk);
              // Given our success, break out of the retry loop
              break;
            } catch (error) {
              console.log("Decryption timed out:", error);
              // The decryption timed out or an error ocurred during it, so terminate the worker
              channels[i]?.terminate();
              // Uninitialize the worker to ensure that a neew one is created in the next iteration
              channels[i] = undefined;
              // We were not sucessful, so try again
              continue;
            }
          }
        }
      }),
    );
  } catch (err) {
    // Callers check `signal.aborted` themselves; an abort isn't a failure.
    if (!signal?.aborted) throw err;
  } finally {
    channels.forEach((channel) => channel?.terminate());
  }
}
