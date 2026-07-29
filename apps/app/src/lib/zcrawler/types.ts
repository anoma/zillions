/** Shared message and result types across the zcrawler main ↔ worker boundary. */

export type NoteId = string;

export type Pool = "sapling" | "orchard";

export interface DecryptedNote {
  pool: Pool;
  /** "external" (received) or "internal" (change). */
  scope: "external" | "internal";
  /** Value in zatoshis. */
  value: number;
  /** This note's own nullifier (hex); shows on-chain when spent. */
  nf_mine: string;
}

export type Note = DecryptedNote & {
  id: string; // accountId + pool + chunk + index // TODO should I use eph_key?
  spent: boolean;
};

export interface CrawlResult {
  hits: DecryptedNote[];
}

/** Main → worker: decrypt the notes in `[from, to]` (both bounds inclusive). */
export interface ChunkRequest {
  ufvk: string;
  chunk: number;
  pool: Pool;
}

/** A worker's decrypted output for one chunk: owned notes and revealed spends. */
export type ChunkWorkerSuccess = {
  chunk: number;
  hits: DecryptedNote[];
  /** Spend nullifiers for the chunk (hex): Orchard `rho` + Sapling nullifiers. */
  spends: string[];
};

export type ChunkWorkerError = {
  chunk: number;
  error: string;
};

/** Worker → main: a chunk's result (tagged with its range), or an error. */
export type ChunkWorkerResponse = ChunkWorkerSuccess | ChunkWorkerError;

export interface CrawlOptions {
  /** Account these notes belong to; scopes every stored row. */
  accountId: string;
  /** Unified full viewing key to scan against. */
  ufvk: string;
  /** Shielded pool to crawl; passed through to the indexer. */
  pool: Pool;
  /** Blocks fetched + decrypted per request. Defaults to 100. */
  chunk?: number;
  /** Parallel workers. Defaults to the number of CPU cores. */
  workers?: number;
  /** Fires as each chunk lands, with the cumulative hits so far. */
  onProgress?: (
    hits: Note[],
    scannedBlocks: number,
    totalBlocks: number,
  ) => void;
  /** Fires once when the crawl finishes, with the final result. */
  onComplete?: () => void;
  /** Fires if the crawl fails. */
  onError?: (err: unknown) => void;
}
