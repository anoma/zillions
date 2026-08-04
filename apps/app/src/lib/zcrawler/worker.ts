/**
 * Zcrawler worker: fetches one block-range chunk from the indexer and
 * trial-decrypts it against a UFVK. Each worker owns its own wasm instance —
 * decryption is stateless, so running many in parallel needs no shared state.
 */

import initZcrawler, {
  try_decrypt,
  try_decrypt_full,
} from "@zillions/sdk/zcrawler";
import { fetchCompactNotes, fetchFullNotes } from "./indexer";
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

worker.onmessage = async (e) => {
  // TODO can we save JS ↔ WASM boundary time by registering the ufvk?
  // And if we create a sequence on the from/to based on the mod of the total blocks?
  // Does it really worth the complexity?
  const { chunk, ufvk, pool } = e.data;
  try {
    await (ready ??= initZcrawler());
    const compactNotes = await fetchCompactNotes(chunk, pool);
    const compactHits = try_decrypt(NETWORK, ufvk, pool, compactNotes);

    if (!compactHits.length) {
      worker.postMessage({ chunk, hits: compactHits, sent: [] });
      return;
    }

    // The chunk holds something of ours, so it is worth its full ciphertexts:
    // they carry what the compact prefix cannot — the memo above all, and the
    // outgoing ciphertexts that make our own sends visible.
    const fullNotes = await fetchFullNotes(chunk, pool);
    const { hits, sent } = try_decrypt_full(NETWORK, ufvk, pool, fullNotes);
    worker.postMessage({ chunk, hits, sent });
  } catch (err) {
    worker.postMessage({ chunk, error: String(err) });
  }
};
