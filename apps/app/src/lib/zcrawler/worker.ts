/**
 * Zcrawler worker: fetches one block-range chunk from the indexer and
 * trial-decrypts it against a UFVK. Each worker owns its own wasm instance —
 * decryption is stateless, so running many in parallel needs no shared state.
 */

import initZcrawler, { try_decrypt } from "@zillions/sdk/zcrawler";

import { fetchSync } from "./indexer";
import type { ChunkRequest, ChunkResponse, CrawlHit } from "./types";

// TODO revisit how config (network, indexer URL) reaches the worker: read from
// import.meta.env at module load as now, injected at worker creation, or passed
// per-message. This whole worker + sync orchestration may move into the SDK
// rather than the app, which would change where config comes from entirely.
const NETWORK = import.meta.env.VITE_ZCASH_NETWORK ?? "main";

let ready: Promise<unknown> | undefined;

// `self` typed as Window in a DOM-lib project; cast to the message surface we use.
const worker = self as unknown as {
  onmessage: ((e: MessageEvent<ChunkRequest>) => void) | null;
  postMessage: (msg: ChunkResponse) => void;
};

worker.onmessage = async (e) => {
  // TODO can we save JS ↔ WASM boundary time by registering the ufvk?
  // And if we create a sequence on the from/to based on the mod of the total blocks?
  // Does it really worth the complexity?
  const { id, ufvk, pool, from, to } = e.data;
  try {
    await (ready ??= initZcrawler());
    const sync = await fetchSync(from, to, pool);
    const hits = try_decrypt(NETWORK, ufvk, sync) as CrawlHit[];
    // Spend nullifiers for the range: Orchard's ride inline as each action's
    // `rho` (= its nf); Sapling's come as their own list. Lowercase to match
    // Rust's `hex::encode` (nf_mine); indexer hex case must not decide equality.
    // Pool-filtered, so the other pool's arrays may be absent.
    const spends = [
      ...(sync.orchard_notes ?? []).map((n) => n.rho.toLowerCase()),
      ...(sync.sapling_nullifiers ?? []).map((nf) => nf.toLowerCase()),
    ];
    worker.postMessage({ id, from, to, hits, spends });
  } catch (err) {
    worker.postMessage({ id, error: String(err) });
  }
};
