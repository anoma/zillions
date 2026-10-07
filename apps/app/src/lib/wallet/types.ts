import type { Block } from "./chain/lightwalletd";
import type { TransparentCache } from "./transparent";

export type Pool = "sapling" | "orchard" | "ironwood";

/** A shielded output: a note we received, or one we sent. */
export interface Output {
  pool: Pool;
  /** Value in zatoshis. */
  value: number;
  /** The encoded address it was sent to. */
  recipient: string;
  /** Its memo as text; absent when it carries none. */
  memo?: string;
  height: number;
  /** Its transaction within its block. */
  tx_index: number;
  /** Position in the pool's note commitment tree. */
  position: number;
}

/** A note this wallet owns, as `try_decrypt_full` reads it out of a chunk. */
export interface DecryptedNote extends Output {
  /** "external" (received) or "internal" (change). */
  scope: "external" | "internal";
  /** This note's own nullifier (hex); shows on-chain when spent. */
  nf_mine: string;
  /** Its index among the transaction's outputs in this pool. */
  output_index: number;
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
  spend: Spend;
};

/**
 * Whether a note was spent, as far as the sync has checked. `at` is the
 * spending transaction; a Sapling spend can be known before it's found.
 */
export type Spend =
  | { status: "unchecked" | "unspent" }
  | { status: "spent"; at?: TxLocator };

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
  /** What history lists for it until it's mined; older records have none. */
  receipt?: PendingActivity;
}

export type PendingActivity = Pick<
  Activity,
  "tx_type" | "value" | "fee" | "timestamp" | "from" | "to"
>;

/** An output this wallet created, recovered with its outgoing viewing key. */
export type SentOutput = Output;

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

/** How far the shielded sync has come. */
export interface ShieldedScan {
  percentage: number;
  /** Absent for a pool not scanned yet. */
  scanned: Partial<Record<Pool, PoolScan>>;
  /** The first Sapling `/nullifiers` chunk not checked yet. */
  saplingNullifiers: number;
  /** Our sending transactions (`height:tx_index`) whose sends have all been read. */
  sendsRead: string[];
}

/** Everything the wallet keeps for one account, stored as a whole. */
export interface WalletState {
  /** Bumped when the shape changes: an older state is dropped and synced again. */
  version: 1;
  id: string;
  notes: Note[];
  sent: Sent[];
  scan: ShieldedScan;
  pending: PendingTx[];
  /** Absent before the first transparent sync. */
  transparent?: TransparentCache;
  /** The blocks history names, for their txids, times and transparent outputs. */
  blocks: Map<number, Block>;
}

/** One transaction as history shows it. */
export type Activity = {
  txid: string;
  tx_type: "Received" | "Sent" | "Shielded" | "Unshielded" | "Migrated";
  value: bigint;
  fee: bigint;
  block_height: number;
  confirmations: number;
  status: "Confirmed" | "Pending" | "Expired";
  memo: string | undefined;
  /** Unix seconds. */
  timestamp?: number;
  pool: "ironwood" | "orchard" | "sapling" | "transparent" | "mixed";
  from: Party;
  to: Party;
};

/**
 * One side of a transaction: someone else's address, or just the pool when
 * the address isn't shown — our own, or a shielded sender, never revealed. A
 * migration names the shielded pools it moved between.
 */
export type Party =
  | { address: string }
  | { pool: "shielded" | "transparent" | "sapling" | "orchard" | "ironwood" };
