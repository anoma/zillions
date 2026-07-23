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
  const { id, ufvk, from, to } = e.data;
  try {
    await (ready ??= initZcrawler());
    const res = await fetch(`${CRAWLER_URL}/notes?start=${from}&end=${to}`);
    if (!res.ok) throw new Error(`notes ${from}-${to}: HTTP ${res.status}`);
    const notes = await res.json();
    const hits = try_decrypt(NETWORK, ufvk, notes) as CrawlHit[];
    worker.postMessage({ id, from, to, hits });
  } catch (err) {
    worker.postMessage({ id, error: String(err) });
  }
};
