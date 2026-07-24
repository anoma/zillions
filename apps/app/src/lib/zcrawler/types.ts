/** Shared message and result types across the zcrawler main ↔ worker boundary. */

export interface CrawlHit {
  pool: "sapling" | "orchard";
  /** "external" (received) or "internal" (change). */
  scope: "external" | "internal";
  /** Value in zatoshis. */
  value: number;
  /** This note's own nullifier (hex); shows on-chain when spent. */
  nf_mine: string;
  /** True once this note's nullifier is seen spent in the scanned range. */
  spent?: boolean;
}

export interface CrawlResult {
  hits: CrawlHit[];
  /** Sum of all hit values (gross received), in zatoshis. */
  totalValue: number;
  /** Sum of unspent hit values (net spendable), in zatoshis. */
  netValue: number;
  /** Peak count of owned unspent notes held during the fold. */
  nullifierSetSize: number;
  /** Logical size of that peak set (32 bytes each), for memory tracking. */
  nullifierSetBytes: number;
}

/** A worker's decrypted output for one chunk: owned notes and revealed spends. */
export interface ChunkData {
  hits: CrawlHit[];
  /** Spend nullifiers for the chunk (hex): Orchard `rho` + Sapling nullifiers. */
  spends: string[];
}

/** Main → worker: decrypt the notes in `[from, to]` (both bounds inclusive). */
export interface ChunkRequest {
  id: number;
  ufvk: string;
  pool: "orchard" | "sapling";
  from: number;
  to: number;
}

/** Worker → main: a chunk's result (tagged with its range), or an error. */
export type ChunkResponse =
  | ({ id: number; from: number; to: number } & ChunkData)
  | { id: number; error: string };

export interface CrawlOptions {
  /** Unified full viewing key to scan against. */
  ufvk: string;
  /** Block range to scan, both bounds inclusive. */
  start: number;
  end: number;
  /** Shielded pool to crawl; passed through to the indexer. */
  pool: "orchard" | "sapling";
  /** Blocks fetched + decrypted per request. Defaults to 100. */
  chunk?: number;
  /** Parallel workers. Defaults to the number of CPU cores. */
  workers?: number;
  /** Fires as each chunk lands, with the cumulative hits so far. */
  onProgress?: (
    hits: CrawlHit[],
    scannedBlocks: number,
    totalBlocks: number,
  ) => void;
  signal?: AbortSignal;
}
