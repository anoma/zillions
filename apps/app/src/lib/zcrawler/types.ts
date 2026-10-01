/** Shared message and result types across the zcrawler main ↔ worker boundary. */

export type Pool = "sapling" | "orchard" | "ironwood";

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
  /** Its index among the transaction's outputs in this pool. */
  output_index: number;
  /** Position in the pool's note commitment tree. */
  position: number;
  /** What spending it needs (hex). Only wasm reads its shape. */
  note: string;
}

/** A transaction's place in the chain — its identity until txids are served. */
export interface TxLocator {
  height: number;
  tx_index: number;
}

export type Note = DecryptedNote & {
  /** `accountId_pool_position` — positions are unique within a pool. */
  id: string;
  /**
   * Where it was spent; `true` when spent in a transaction not found yet;
   * `false` once checked as far as the sync reached; absent until checked.
   */
  spent?: boolean | TxLocator;
};

/** Main → worker: decrypt one chunk of one pool. */
export interface ChunkRequest {
  ufvk: string;
  chunk: number;
  pool: Pool;
  /**
   * Revisits a chunk already read, in full: where these records (indices from
   * `find_spends`) spent our notes, and what the chunk shows we sent.
   */
  spends?: number[];
}

/** Where one of our notes was spent, from the action that spent it. */
export interface SpendPlace extends TxLocator {
  /** The nullifier spent: the spent note's `nf_mine`. */
  nf: string;
}

/** A transaction we broadcast that isn't seen mined yet. */
export interface PendingTx {
  txid: string;
  /** The last height it can be mined at; 0 for never. */
  expiryHeight: number;
  /** The notes it spends, by nullifier. */
  nullifiers: string[];
  /** The coins it spends, as `txid:index`. */
  outpoints: string[];
  /** Zatoshis it returns to us as change. */
  change: number;
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

/** A worker's decrypted output for one chunk: what this UFVK received, sent and spent. */
export type ChunkWorkerSuccess = {
  chunk: number;
  hits: DecryptedNote[];
  sent: SentOutput[];
  spends: SpendPlace[];
  /** The raw `/ciphertexts` body, for the spend check that must run in chunk order. */
  body: Uint8Array;
};

export type ChunkWorkerError = {
  chunk: number;
  error: string;
};

/** Worker → main: a chunk's result, or the error that chunk hit. */
export type ChunkWorkerResponse = ChunkWorkerSuccess | ChunkWorkerError;

/** How far a pool's oldest-first scan has come. */
export interface PoolScan {
  /** The first chunk that can hold the wallet's notes: the birthday's, or 0. */
  start: number;
  /** The first chunk not read yet. */
  next: number;
}

export interface SyncStatus {
  id: string;
  percentage: number;
  /** Absent for a pool not scanned yet. */
  scanned: Partial<Record<Pool, PoolScan>>;
  /** The first Sapling `/nullifiers` chunk not checked yet. */
  saplingNullifiers: number;
  /** Our sending transactions (`height:tx_index`) whose sends have all been read. */
  sendsRead: string[];
  pending: PendingTx[];
}
