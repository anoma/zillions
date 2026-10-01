/**
 * Zcrawler worker: fetches one block-range chunk from the indexer and
 * trial-decrypts it against a UFVK. Each worker owns its own wasm instance —
 * decryption is stateless, so running many in parallel needs no shared state.
 */

import initZcrawler, { try_decrypt, try_decrypt_full } from "@zillions/zcore";
import { fetchChunk } from "./indexer";
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
    const body = await fetchChunk("ciphertexts", chunk, pool);
    const {
      count,
      min_height: minHeight,
      hits: compactHits,
    } = try_decrypt(NETWORK, ufvk, pool, chunk, body);

    if (!compactHits.length) {
      worker.postMessage({ chunk, count, minHeight, hits: [], sent: [] });
      return;
    }

    // A hit makes the memos and outgoing ciphertexts (our sends) worth fetching.
    const [memos, outgoing] = await Promise.all([
      fetchChunk("memos", chunk, pool),
      fetchChunk("outgoing", chunk, pool),
    ]);
    const { hits, sent } = try_decrypt_full(
      NETWORK,
      ufvk,
      pool,
      chunk,
      body,
      memos,
      outgoing,
      Uint32Array.from(compactHits, (hit: { index: number }) => hit.index),
    );
    worker.postMessage({ chunk, count, minHeight, hits, sent });
  } catch (err) {
    worker.postMessage({ chunk, error: String(err) });
  }
};
