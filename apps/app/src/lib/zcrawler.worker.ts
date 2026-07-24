/**
 * Zcrawler worker: fetches one block-range chunk from the indexer and
 * trial-decrypts it against a UFVK. Each worker owns its own wasm instance —
 * decryption is stateless, so running many in parallel needs no shared state.
 */

import initZcrawler, { try_decrypt } from "@zillions/sdk/zcrawler";

import type { ChunkRequest, ChunkResponse, CrawlHit } from "./zcrawler";

const CRAWLER_URL = import.meta.env.VITE_CRAWLER_URL ?? "http://localhost:8080";
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
  const { id, ufvk, from, to } = e.data;
  try {
    await (ready ??= initZcrawler());
    // TODO can we do a faster request if it runs on rust-wasm?
    const res = await fetch(`${CRAWLER_URL}/notes?start=${from}&end=${to}`);
    if (!res.ok) throw new Error(`notes ${from}-${to}: HTTP ${res.status}`);
    const notes = await res.json();
    const hits = try_decrypt(NETWORK, ufvk, notes) as CrawlHit[];
    // Every Orchard action reveals the nullifier of the note it spends (its `nf`).
    // Collect them as the range's spend set — free, already in the payload.
    // Lowercase to match Rust's `hex::encode` output (nf_mine); the indexer's
    // hex case must not decide equality.
    const spends: string[] = Array.isArray(notes.orchard)
      ? notes.orchard
          .map((n: { nf: string }) => n.nf?.toLowerCase())
          .filter(Boolean)
      : [];
    worker.postMessage({ id, from, to, hits, spends });
  } catch (err) {
    worker.postMessage({ id, error: String(err) });
  }
};
