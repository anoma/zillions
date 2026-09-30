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
  /** The encoded address the note was sent to — one of ours. */
  recipient: string;
  height: number;
  /** The note's transaction within its block. */
  tx_index: number;
  /** Position in the pool's note commitment tree. */
  position: number;
}

/** A transaction's place in the chain — its identity until txids are served. */
export interface TxLocator {
  height: number;
  tx_index: number;
}

export type Note = DecryptedNote & {
  /** `accountId_pool_position` — positions are unique within a pool. */
  id: string;
  /** Where it was spent, `false` once checked and unspent, absent until checked. */
  spent?: false | TxLocator;
};

/** Main → worker: decrypt one chunk of one pool. */
export interface ChunkRequest {
  ufvk: string;
  chunk: number;
  pool: Pool;
}

/** An output this wallet created, recovered with its outgoing viewing key. */
export interface SentOutput {
  pool: Pool;
  /** Value in zatoshis, as the recipient received it. */
  value: number;
  /** The encoded address it was sent to. */
  recipient: string;
  memo?: string;
  height: number;
  tx_index: number;
  position: number;
}

export type Sent = SentOutput & {
  /** `accountId_pool_position` — positions are unique within a pool. */
  id: string;
};

/** A worker's decrypted output for one chunk: what this UFVK received and sent. */
export type ChunkWorkerSuccess = {
  chunk: number;
  /** Notes the chunk held; fewer than a full chunk's while it is the tip. */
  count: number;
  /** The lowest block height among the chunk's notes. */
  minHeight: number;
  hits: DecryptedNote[];
  sent: SentOutput[];
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
