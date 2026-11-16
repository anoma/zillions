/**
 * Decrypt worker: fetches one block-range chunk from the indexer and
 * trial-decrypts it against a UFVK. Each worker owns its own wasm instance —
 * decryption is stateless, so running many in parallel needs no shared state.
 */

import initZcore, {
  gpu_inputs,
  try_decrypt,
  try_decrypt_full,
  try_decrypt_gpu,
} from "@zillions/zcore";
import { fetchChunk } from "../chain/indexer";
import { NETWORK } from "../config";
import type {
  ChunkRequest,
  ChunkWorkerResponse,
  GpuReply,
  Pool,
} from "../types";

let ready: Promise<unknown> | undefined;
/** Off for good in this worker once the page has no GPU, or it failed. */
let gpuOff = false;
/** Waiting on the page's GPU; one chunk at a time, so one at most. */
let gpuReply: ((reply: GpuReply) => void) | undefined;

/** The page's GPU, which every worker shares, runs the key agreement. */
function pageSecrets(pool: Pool, gpuInputs: Uint8Array) {
  return new Promise<GpuReply>((resolve) => {
    gpuReply = resolve;
    worker.postMessage({ pool, gpuInputs }, [gpuInputs.buffer]);
  });
}

/** `try_decrypt`, with its key agreement on the GPU when there is one. */
async function decrypt(
  ufvk: string,
  pool: Pool,
  chunk: number,
  body: Uint8Array,
  from: number,
  tried: Uint8Array,
  gpu: boolean,
) {
  if (gpu && !gpuOff) {
    try {
      const inputs = gpu_inputs(NETWORK, ufvk, pool, body, from, tried);
      // Only the ivks: no notes left to try, or no key for this pool.
      if (inputs.length <= 64)
        return try_decrypt(NETWORK, ufvk, pool, chunk, body, from, tried);
      const reply = await pageSecrets(pool, inputs);
      if ("gpuError" in reply) throw new Error(reply.gpuError);
      if (reply.secrets)
        return try_decrypt_gpu(
          NETWORK,
          ufvk,
          pool,
          chunk,
          body,
          from,
          tried,
          reply.secrets,
        );
      gpuOff = true;
    } catch (err) {
      gpuOff = true;
      console.warn(`GPU trial decryption failed, back on the CPU: ${err}`);
    }
  }
  return try_decrypt(NETWORK, ufvk, pool, chunk, body, from, tried);
}

// `self` typed as Window in a DOM-lib project; cast to the message surface we use.
const worker = self as unknown as {
  onmessage: ((e: MessageEvent<ChunkRequest | GpuReply>) => void) | null;
  postMessage: (msg: ChunkWorkerResponse, transfer?: Transferable[]) => void;
};

worker.onmessage = async (e) => {
  if (!("chunk" in e.data)) return gpuReply?.(e.data);
  // TODO can we save JS ↔ WASM boundary time by registering the ufvk?
  // And if we create a sequence on the from/to based on the mod of the total blocks?
  // Does it really worth the complexity?
  const { chunk, ufvk, pool, sends, tried, gpu } = e.data;
  try {
    await (ready ??= initZcore());
    const body = await fetchChunk("ciphertexts", chunk, pool);
    const resume = tried?.chunk === chunk ? tried : undefined;
    // Not redundant with the crawl: an output paying us is a note, never a
    // payment, and the crawl may not have read this chunk yet.
    const compact = (
      sends
        ? { hits: sends.map((index) => ({ index })) }
        : await decrypt(
            ufvk,
            pool,
            chunk,
            body,
            resume?.count ?? 0,
            Uint8Array.from(resume?.digest.match(/../g) ?? [], (b) =>
              parseInt(b, 16),
            ),
            gpu ?? false,
          )
    ) as {
      hits: { index: number }[];
      min_height?: number;
      count?: number;
      from?: number;
      digest?: string;
    };
    const { hits, min_height: minHeight, count, from, digest } = compact;
    const read = {
      minHeight,
      tried: digest ? { chunk, count: count!, digest } : undefined,
      skipped: from,
    };

    if (!hits.length) {
      worker.postMessage({ chunk, hits: [], sent: [], ...read });
      return;
    }

    // A hit makes the memos worth fetching; only a sends read opens outgoing ones.
    const [memos, outgoing] = await Promise.all([
      fetchChunk("memos", chunk, pool),
      sends ? fetchChunk("outgoing", chunk, pool) : new Uint8Array(),
    ]);
    const full = try_decrypt_full(
      NETWORK,
      ufvk,
      pool,
      chunk,
      body,
      memos,
      outgoing,
      Uint32Array.from(hits, (hit) => hit.index),
      Uint32Array.from(sends ?? []),
    );
    worker.postMessage({ chunk, ...full, ...read });
  } catch (err) {
    worker.postMessage({ chunk, error: String(err) });
  }
};
