import type { Block } from "./chain/lightwalletd";
import type { Migration } from "./migration";
import type { ParsedTx, TransparentCache } from "./transparent";

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

/** Whether a note was spent, as far as the sync has checked; `at` is the spending transaction. */
export type Spend =
  { status: "unchecked" | "unspent" } | { status: "spent"; at: TxLocator };

/**
 * Whose key reads a chunk: the account's, named by its keychain id as only
 * the keychain holds it, or a payment link's own, which this page does.
 */
export type ChunkKey = { account: string } | { ufvk: string };

/** Decrypt one chunk of one pool. */
export interface ChunkRequest {
  key: ChunkKey;
  chunk: number;
  pool: Pool;
  /** Indexes in this chunk of a transaction we authored: read for its notes and payments, and nothing else. */
  sends?: number[];
  /** The notes an earlier read tried, skipped when it was this chunk and they're unchanged. */
  tried?: Tried;
}

/** Main → worker: a chunk a link's key reads. */
export type LinkChunkRequest = Omit<ChunkRequest, "key"> & { ufvk: string };

/** How many of a chunk's notes a read tried, and a fingerprint of their bytes. */
export interface Tried {
  chunk: number;
  count: number;
  digest: string;
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
  /** Zatoshis it returns to us, as change or a payment to ourselves. */
  change: number;
  /** The part of `change` going to a transparent address; older records have none. */
  transparentChange?: number;
  /** What history lists for it until it's mined; older records have none. */
  receipt?: PendingActivity;
}

export type PendingActivity = Pick<
  Activity,
  "tx_type" | "value" | "fee" | "timestamp" | "from" | "to"
> & { memo?: string };

/** An output this wallet created, recovered with its outgoing viewing key. */
export type SentOutput = Output & {
  /** What shows the payment link it funds again, hex; the seal opens only with our seed. */
  link?: { nk: string; sealed: string };
};

export type Sent = SentOutput & {
  /** `accountId_pool_position` — positions are unique within a pool. */
  id: string;
};

/** A worker's decrypted output for one chunk: what this UFVK received and sent. */
export type ChunkWorkerSuccess = {
  chunk: number;
  hits: DecryptedNote[];
  sent: SentOutput[];
  /** The chunk's oldest block height; absent for a sends read. */
  minHeight?: number;
  /** What this read tried, and how many notes it skipped as tried before; absent for a sends read. */
  tried?: Tried;
  skipped?: number;
};

export type ChunkWorkerError = {
  chunk: number;
  error: string;
};

/** Worker → main: a chunk's result, or the error that chunk hit. */
export type ChunkWorkerResponse = ChunkWorkerSuccess | ChunkWorkerError;

/** Chunks read newest-first: `from` to `to` are read (none when `from > to`), `floor` to `from - 1` are left. */
export interface Segment {
  floor: number;
  from: number;
  to: number;
}

/**
 * A pool's chunks in three segments: after the spam era (`top`, which grows
 * with the chain), before it, and the spam era itself.
 */
export interface PoolScan {
  top: Segment;
  before: Segment;
  spam: Segment;
  /** The chunk in `top` where setup ends: the build's `SETUP_CHUNKS`, never below `top.floor`. */
  setup?: number;
  /** The oldest block height read in `top`. */
  oldestHeight?: number;
  /** The newest chunk's notes tried so far: catch-up re-reads that chunk and tries only the rest. */
  tried?: Tried;
}

/** How far the shielded sync has come. */
export interface ShieldedScan {
  /** Absent for a pool not scanned yet. */
  scanned: Partial<Record<Pool, PoolScan>>;
  setupDone: boolean;
  /** Whether the user started the spam era's sync; kept until they pause it. */
  spamSync?: boolean;
  /** Our authored transactions (`height:tx_index`) whose sends have all been read. */
  sendsRead: string[];
}

/** Everything the wallet keeps for one account, stored as a whole. */
export interface WalletState {
  /** Bumped when the shape changes: an older state is dropped and synced again. */
  version: 5;
  id: string;
  notes: Note[];
  sent: Sent[];
  scan: ShieldedScan;
  pending: PendingTx[];
  /** Absent before the first transparent sync. */
  transparent?: TransparentCache;
  /** The blocks history names, for their txids and times. */
  blocks: Map<number, Block>;
  /** History's transactions read in full, by txid. */
  txs: Map<string, ParsedTx>;
  /** A migration to Ironwood in progress (2.9). */
  migration?: Migration;
}

/** One transaction as history shows it. */
export type Activity = {
  txid: string;
  tx_type:
    | "Received"
    | "Sent"
    | "Shielded"
    | "Unshielded"
    | "Migrated"
    /** A migration's preparation: Orchard split into standard amounts. */
    | "Prepared";
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
  /** A payment to the account itself: it shows no sign. */
  self?: true;
};

/** Someone else's address, with what it was paid when it's a recipient. */
export type Counterparty = { address: string; value?: bigint };

/**
 * One side of a transaction: someone else's address, the first of several
 * when `more` holds the rest, or just the pool when the address isn't shown
 * — our own, or a shielded sender, never revealed. A migration names the
 * shielded pools it moved between.
 */
export type Party =
  | (Counterparty & { more?: Counterparty[] })
  | { pool: "shielded" | "transparent" | "sapling" | "orchard" | "ironwood" };
