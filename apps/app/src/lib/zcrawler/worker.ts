/**
 * Zcrawler worker: fetches one block-range chunk from the indexer and
 * trial-decrypts it against a UFVK. Each worker owns its own wasm instance —
 * decryption is stateless, so running many in parallel needs no shared state.
 */

import initZcrawler, {
  try_decrypt_full,
  try_decrypt_orchard,
  try_decrypt_sapling,
} from "@zillions/sdk/zcrawler";
import {
  CHUNK_SIZE,
  fetchCompactNotes,
  fetchFullNotes,
  fetchOrchardCiphertexts,
  OLD_CHUNK_SIZE,
} from "./indexer";
import type { ChunkRequest, ChunkWorkerResponse } from "./types";

// TODO revisit how config (network, indexer URL) reaches the worker: read from
// import.meta.env at module load as now, injected at worker creation, or passed
// per-message. This whole worker + sync orchestration may move into the SDK
// rather than the app, which would change where config comes from entirely.
const NETWORK = import.meta.env.VITE_ZCASH_NETWORK ?? "main";

let ready: Promise<unknown> | undefined;

// `self` typed as Window in a DOM-lib project; cast to the message surface we use.
const worker = self as unknown as {
  onmessage: ((e: MessageEvent<ChunkRequest>) => void) | null;
  postMessage: (msg: ChunkWorkerResponse) => void;
};

/**
 * The full notes behind a chunk's compact hits. Full notes still come from the
 * old server, whose chunks are a quarter of an Orchard chunk on the new one, so
 * only the old chunks holding a hit are fetched.
 */
async function fetchFull(
  chunk: number,
  pool: ChunkRequest["pool"],
  compactHits: { index: number }[],
) {
  if (pool !== "orchard") return fetchFullNotes(chunk, pool);
  const oldChunks = new Set(
    compactHits.map(({ index }) =>
      Math.floor((chunk * CHUNK_SIZE + index) / OLD_CHUNK_SIZE),
    ),
  );
  const parts = await Promise.all(
    [...oldChunks].map((old) => fetchFullNotes(old, pool)),
  );
  return parts.flat();
}

worker.onmessage = async (e) => {
  // TODO can we save JS ↔ WASM boundary time by registering the ufvk?
  // And if we create a sequence on the from/to based on the mod of the total blocks?
  // Does it really worth the complexity?
  const { chunk, ufvk, pool } = e.data;
  try {
    await (ready ??= initZcrawler());
    const compactHits =
      pool === "orchard"
        ? try_decrypt_orchard(
            NETWORK,
            ufvk,
            await fetchOrchardCiphertexts(chunk),
          )
        : try_decrypt_sapling(
            NETWORK,
            ufvk,
            await fetchCompactNotes(chunk, pool),
          );

    if (!compactHits.length) {
      worker.postMessage({ chunk, hits: compactHits, sent: [] });
      return;
    }

    // The chunk holds something of ours, so it is worth its full ciphertexts:
    // they carry what the compact prefix cannot — the memo above all, and the
    // outgoing ciphertexts that make our own sends visible.
    const fullNotes = await fetchFull(chunk, pool, compactHits);
    const { hits, sent } = try_decrypt_full(NETWORK, ufvk, pool, fullNotes);
    worker.postMessage({ chunk, hits, sent });
  } catch (err) {
    worker.postMessage({ chunk, error: String(err) });
  }
};
