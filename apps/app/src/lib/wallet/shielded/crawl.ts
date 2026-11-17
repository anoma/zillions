/**
 * Runs a pool's chunks across parallel channels: chunks are fetched and
 * decrypted concurrently, but handed to `onChunk` strictly newest-first.
 */

import { keychain } from "../../keychain/keychain";
import { bytesToBase64 } from "../../keychain/utils";
import { fetchChunk } from "../chain/indexer";
import type {
  ChunkKey,
  ChunkRequest,
  ChunkWorkerResponse,
  ChunkWorkerSuccess,
  Pool,
  Tried,
} from "../types";
import DecryptWorker from "./worker.ts?worker";

/** `work`, or `signal`'s reason as soon as it aborts: the keychain can't be interrupted. */
function unlessAborted<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  let onAbort = () => {};
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }),
  ]).finally(() => signal.removeEventListener("abort", onAbort));
}

/** One chunk read by the keychain, from the bodies this page fetches for it. */
async function keychainRead(
  account: string,
  { chunk, pool, sends, tried }: ChunkRequest,
  signal?: AbortSignal,
): Promise<ChunkWorkerSuccess> {
  const fetchBase64 = async (kind: "ciphertexts" | "memos" | "outgoing") => {
    const body = await fetchChunk(kind, chunk, pool);
    signal?.throwIfAborted();
    return bytesToBase64(body);
  };
  signal?.throwIfAborted();
  const ciphertexts = await fetchBase64("ciphertexts");
  const resume = tried?.chunk === chunk ? tried : undefined;
  const compact = sends
    ? undefined
    : await unlessAborted(
        keychain().decryptCompact({
          account,
          pool,
          chunk,
          ciphertexts,
          tried: resume && { count: resume.count, digest: resume.digest },
        }),
        signal,
      );
  const read = compact && {
    minHeight: compact.min_height,
    tried: { chunk, count: compact.count, digest: compact.digest },
    skipped: compact.from,
  };
  const hits = compact?.hits ?? [];
  if (!hits.length && !sends) return { chunk, hits: [], sent: [], ...read };

  // A hit makes the memos worth fetching; only a sends read opens outgoing ones.
  const [memos, outgoing] = await Promise.all([
    fetchBase64("memos"),
    sends ? fetchBase64("outgoing") : "",
  ]);
  const full = await unlessAborted(
    keychain().decryptFull({
      account,
      pool,
      chunk,
      ciphertexts,
      memos,
      outgoing,
      hits: hits.map((hit) => hit.index),
      sends,
    }),
    signal,
  );
  return { chunk, ...full, ...read } as ChunkWorkerSuccess;
}

/**
 * A request/response channel for chunks, one in flight at a time: the
 * account's go to the keychain, a link's to a worker started for it.
 * Aborting `signal` rejects the chunk in flight, terminating its worker.
 */
export function chunkChannel(signal?: AbortSignal) {
  let worker: Worker | undefined;
  const runWorker = (ufvk: string, request: ChunkRequest) => {
    const current = (worker ??= new DecryptWorker());
    let onAbort = () => {};
    return (
      new Promise<ChunkWorkerSuccess>((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason);
        onAbort = () => {
          current.terminate();
          worker = undefined;
          reject(signal!.reason);
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        current.onmessage = ({ data }: MessageEvent<ChunkWorkerResponse>) => {
          if ("error" in data) reject(new Error(data.error));
          else resolve(data);
        };
        current.onerror = (e) => reject(new Error(e.message || "worker error"));
        const { chunk, pool, sends, tried } = request;
        current.postMessage({ chunk, pool, sends, tried, ufvk });
      })
        // The signal outlives thousands of chunks: drop each one's listener.
        .finally(() => signal?.removeEventListener("abort", onAbort))
    );
  };
  return {
    run: (request: ChunkRequest) =>
      "account" in request.key
        ? keychainRead(request.key.account, request, signal)
        : runWorker(request.key.ufvk, request),
    terminate: () => worker?.terminate(),
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

export async function crawlChunks(options: {
  key: ChunkKey;
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
  const { key, pool, from, to, signal, workers, onChunk, tried } = options;

  const total = to - from + 1;
  if (total <= 0) return;

  const release = orderedBuffer<ChunkWorkerSuccess>(to);
  const channels: (ReturnType<typeof chunkChannel> | undefined)[] = [];

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
          const channel = (channels[i] ??= chunkChannel(signal));
          const chunk = nextChunk--;
          release(
            chunk,
            await channel.run({ key, chunk, pool, tried }),
          ).forEach(onChunk);
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
