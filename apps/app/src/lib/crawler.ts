/**
 * Note crawler: fetch compact notes from the indexer over a block range and
 * trial-decrypt them against a UFVK to find the wallet's notes and their value.
 *
 * Stateless — no wallet DB, no commitment tree. The only wasm involved is the
 * decrypt primitive (`@zillions/sdk/crawler`). Kept as a plain function so it
 * can move into a web worker later without touching callers.
 */

import initCrawler, { try_decrypt } from "@zillions/sdk/crawler";

const CRAWLER_URL = import.meta.env.VITE_CRAWLER_URL ?? "http://localhost:8080";
const NETWORK = import.meta.env.VITE_ZCASH_NETWORK ?? "main";

let ready: Promise<void> | undefined;
const ensureReady = (): Promise<void> =>
  (ready ??= initCrawler().then(() => undefined));

export interface CrawlHit {
  pool: "sapling" | "orchard";
  height: number;
  tx_index: number;
  index: number;
  position: number;
  /** Value in zatoshis. */
  value: number;
}

export interface CrawlResult {
  hits: CrawlHit[];
  /** Sum of hit values, in zatoshis. */
  totalValue: number;
}

export interface CrawlOptions {
  /** Blocks fetched + decrypted per request. Defaults to 100. */
  chunk?: number;
  onProgress?: (scannedTo: number, hitsSoFar: number) => void;
  signal?: AbortSignal;
}

/** Crawl `[start, end)` and return the notes the UFVK owns. */
export async function crawlNotes(
  ufvk: string,
  start: number,
  end: number,
  options: CrawlOptions = {},
): Promise<CrawlResult> {
  await ensureReady();
  const chunk = options.chunk ?? 100;
  const hits: CrawlHit[] = [];

  for (let from = start; from < end; from += chunk) {
    options.signal?.throwIfAborted();
    const to = Math.min(end, from + chunk);
    const res = await fetch(`${CRAWLER_URL}/notes?start=${from}&end=${to}`, {
      signal: options.signal,
    });
    if (!res.ok) throw new Error(`notes ${from}-${to}: HTTP ${res.status}`);
    const notes = await res.json();
    hits.push(...(try_decrypt(NETWORK, ufvk, notes) as CrawlHit[]));
    options.onProgress?.(to, hits.length);
  }

  const totalValue = hits.reduce((n, h) => n + h.value, 0);
  return { hits, totalValue };
}
