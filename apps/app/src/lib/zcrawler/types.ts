/** Shared message and result types across the zcrawler main ↔ worker boundary. */

export type Pool = "sapling" | "orchard";

/** A note this wallet owns, as `try_decrypt_full` reads it out of a chunk. */
export interface DecryptedNote {
  pool: Pool;
  /** "external" (received) or "internal" (change). */
  scope: "external" | "internal";
  /** Value in zatoshis. */
  value: number;
  /** This note's own nullifier (hex); shows on-chain when spent. */
  nf_mine: string;
  /** The note's memo as text; absent when it carries none. */
  memo?: string;
  /** The diversified address the note was sent to (raw bytes, hex). */
  recipient: string;
  height: number;
  /** The note's transaction within its block. */
  tx_index: number;
  /** Position in the pool's note commitment tree. */
  position: number;
}

export type Note = DecryptedNote & {
  /** `accountId_pool_chunk_index` — stable as long as chunk boundaries are. */
  id: string;
  spent?: boolean;
};

/** Main → worker: decrypt one chunk of one pool. */
export interface ChunkRequest {
  ufvk: string;
  chunk: number;
  pool: Pool;
}

/** A worker's decrypted output for one chunk: the notes this UFVK owns. */
export type ChunkWorkerSuccess = {
  chunk: number;
  hits: DecryptedNote[];
};

export type ChunkWorkerError = {
  chunk: number;
  error: string;
};

/** Worker → main: a chunk's result, or the error that chunk hit. */
export type ChunkWorkerResponse = ChunkWorkerSuccess | ChunkWorkerError;

/** The contiguous chunk range already scanned for a pool; `to < from` is empty. */
export interface ChunkRange {
  from: number;
  to: number;
}

export interface SyncStatus {
  id: string;
  percentage: number;
  scanned: Record<Pool, ChunkRange>;
}
