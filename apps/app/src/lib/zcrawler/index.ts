/** Public surface of the zcrawler: scan a UFVK over a block range for its notes. */

export { crawlNotes, planChunks } from "./crawl";
export { getChainTip } from "./indexer";
export { SpendLedger } from "./ledger";
export type {
  ChunkRequest,
  ChunkResponse,
  CrawlHit,
  CrawlOptions,
  CrawlResult,
} from "./types";
