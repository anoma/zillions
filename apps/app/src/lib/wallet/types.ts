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

/** Main → worker: decrypt one chunk of one pool. */
export interface ChunkRequest {
  ufvk: string;
  chunk: number;
  pool: Pool;
  /** Reads only what the chunk shows we sent, even with no note of ours in it. */
  sends?: true;
  /** The notes an earlier read tried, skipped when it was this chunk and they're unchanged. */
  tried?: Tried;
  /** Trial-decrypts on the GPU when there is one, else on the CPU. */
  gpu?: boolean;
}

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

/** Worker → main: a chunk's key agreement, for the page's GPU to run. */
export type GpuRequest = { pool: Pool; gpuInputs: Uint8Array };

/** Main → worker: its secrets, `null` when there's no usable GPU. */
export type GpuReply = { secrets: Uint32Array | null } | { gpuError: string };

/** Worker → main: a chunk's result, the error that chunk hit, or a GPU request. */
export type ChunkWorkerResponse =
  ChunkWorkerSuccess | ChunkWorkerError | GpuRequest;

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
  /** Our sending transactions (`height:tx_index`) whose sends have all been read. */
  sendsRead: string[];
}

/** Everything the wallet keeps for one account, stored as a whole. */
export interface WalletState {
  /** Bumped when the shape changes: an older state is dropped and synced again. */
  version: 4;
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
  /** All NEAR intents in progress. */
  swaps: {
    depositAddress: string;
    outbound: boolean;
    originChainTxHashes: { hash: string; explorerUrl: string }[];
  }[];
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

/** Query parameters for the Check Swap Execution Status GET request. */
export interface CheckSwapExecutionStatusQueryParams {
  /** Unique deposit address from the quote. */
  depositAddress: string;
  /** Deposit memo from the quote. Required if it was included in the quote response. */
  depositMemo?: string;
}

/** Headers for the API request. */
export interface CheckSwapExecutionStatusHeaders {
  /** API key for partner authentication (recommended). */
  "X-API-Key"?: string;
}

/** Represents the execution state of the swap. */
export type SwapStatus =
  | "KNOWN_DEPOSIT_TX"
  | "PENDING_DEPOSIT"
  | "INCOMPLETE_DEPOSIT"
  | "PROCESSING"
  | "SUCCESS"
  | "REFUNDED"
  | "FAILED";

/** Details mapping a transaction hash to its block explorer URL. */
export interface TxHashDetails {
  hash: string;
  explorerUrl: string;
}

/** Details of the actual swap execution and withdrawals. */
export interface SwapDetails {
  intentHashes?: string[];
  nearTxHashes?: string[];
  originChainTxHashes?: TxHashDetails[];
  destinationChainTxHashes?: TxHashDetails[];
  amountIn?: string;
  amountInFormatted?: string;
  amountInUsd?: string;
  amountOut?: string;
  amountOutFormatted?: string;
  amountOutUsd?: string;
  slippage?: number;
  refundedAmount?: string;
  refundedAmountFormatted?: string;
  refundedAmountUsd?: string;
  refundReason?: string;
  depositedAmount?: string;
  depositedAmountFormatted?: string;
  depositedAmountUsd?: string;
  withdrawFee?: string;
  referral?: string;
}

/** Recipient mapping for fee rebates. */
export interface Rebate {
  recipient: string;
  share: number;
}

/** Application fee configuration. */
export interface AppFee {
  recipient: string;
  fee: number;
}

/** Details of the original request used to generate the quote. */
export interface QuoteRequest {
  dry?: boolean;
  swapType: string;
  slippageTolerance: number;
  originAsset: string;
  depositType: string;
  destinationAsset: string;
  amount: string;
  refundTo: string;
  refundType: string;
  recipient: string;
  recipientType: string;
  deadline: string;
  depositMode: string;
  connectedWallets?: string[];
  sessionId?: string;
  virtualChainRecipient?: string;
  virtualChainRefundRecipient?: string;
  customRecipientMsg?: string;
  confidentiality?: string;
  referral?: string;
  rebates?: Rebate[];
  quoteWaitingTimeMs?: number;
  appFees?: AppFee[];
  insured?: boolean;
}

export interface ChainDepositAddress {
  blockchain: string;
  address: string;
  memo?: string;
}

/** Details of the generated quote. */
export interface Quote {
  amountIn: string;
  amountInFormatted: string;
  amountInUsd: string;
  minAmountIn?: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd: string;
  minAmountOut?: string;
  timeEstimate: number;
  depositAddress: string;
  depositMemo?: string;
  chainDepositAddresses?: ChainDepositAddress[];
  deadline: string;
  timeWhenInactive?: string;
  virtualChainRecipient?: string;
  virtualChainRefundRecipient?: string;
  customRecipientMsg?: string;
  refundFee?: string;
  withdrawFee?: string;
}

/** Quote response from the original request. */
export interface QuoteResponse {
  correlationId: string;
  timestamp: string;
  signature?: string;
  quoteRequest: QuoteRequest;
  quote: Quote;
}

/** Standard HTTP 200 Response for the Check Swap Execution Status endpoint. */
export interface CheckSwapExecutionStatusResponse {
  /** Unique identifier for request tracing and debugging */
  correlationId: string;
  /** Quote response from the original request */
  quoteResponse: QuoteResponse;
  /** The current status of the swap */
  status: SwapStatus;
  /** Last time the state was updated (ISO 8601 Date-Time string) */
  updatedAt: string;
  /** Details of actual swaps and withdrawals */
  swapDetails: SwapDetails;
}

/** Standard HTTP 404/Error Response. */
export interface ErrorResponse {
  message: string;
}

// Add type definition for the tokens endpoint
export type Token = {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price: number;
  priceUpdatedAt: string;
  contractAddress?: string;
  coingeckoId: string;
};
