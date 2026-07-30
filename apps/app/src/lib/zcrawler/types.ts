/** Shared message and result types across the zcrawler main ↔ worker boundary. */

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
  /** `accountId_pool_chunk_index` — stable as long as chunk boundaries are. */
  id: string;
  spent: boolean;
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
