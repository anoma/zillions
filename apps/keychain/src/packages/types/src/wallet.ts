/**
 * What a site asks the Keychain to do with the account's viewing key, which
 * never leaves it: trial-decrypt the chunks the site fetched, give out
 * addresses, and build, sign and prove transactions. Bytes cross as base64,
 * as extension messaging can't carry them raw on every browser.
 */

export type Pool = "sapling" | "orchard" | "ironwood";

/** How many of a chunk's notes an earlier read tried, and their fingerprint. */
export type TriedNotes = { count: number; digest: string };

export type DecryptCompactProps = {
  /** The shielded account's address; the site's own when omitted. */
  account?: string;
  pool: Pool;
  chunk: number;
  /** The chunk's `/ciphertexts` body, base64. */
  ciphertexts: string;
  /** Skips these notes when the chunk still starts with them. */
  tried?: TriedNotes;
};

/** A note of the account's, from its compact ciphertext. */
export type CompactHit = {
  pool: Pool;
  scope: "external" | "internal";
  value: number;
  /** Hex; it appears on-chain once the note is spent. */
  nf_mine: string;
  /** Its index among the chunk's notes. */
  index: number;
};

export type CompactChunk = {
  count: number;
  min_height: number;
  hits: CompactHit[];
  /** The first note tried. */
  from: number;
  digest: string;
};

export type DecryptFullProps = {
  account?: string;
  pool: Pool;
  chunk: number;
  /** The chunk's `/ciphertexts`, `/memos` and `/outgoing` bodies, base64. */
  ciphertexts: string;
  memos: string;
  /** Empty unless `sends` names any: only a sends read opens it. */
  outgoing: string;
  /** The compact hits to read in full. */
  hits: number[];
  /** Indexes of an authored transaction's outputs: read for its notes and payments. */
  sends?: number[];
};

export type FullHit = Omit<CompactHit, "index"> & {
  memo?: string;
  recipient: string;
  height: number;
  tx_index: number;
  output_index: number;
  position: number;
  /** What spending it needs, opaque. */
  note: string;
};

export type SentOutput = {
  pool: Pool;
  value: number;
  recipient: string;
  memo?: string;
  /** What shows the payment link it funds again, hex. */
  link?: { nk: string; sealed: string };
  height: number;
  tx_index: number;
  position: number;
};

export type FullChunk = { hits: FullHit[]; sent: SentOutput[] };

/** What a site needs to keep the account's wallet besides its notes. */
export type AccountInfo = {
  /** The shielded pools the viewing key covers. */
  pools: Pool[];
  /** The external index of the transparent address the account shows, if any. */
  transparentIndex?: number;
  /** An AES-GCM-256 key for the site's copy of the wallet, base64. */
  storageKey: string;
};

export type TransparentAddressesProps = {
  account?: string;
  scope: "external" | "internal";
  from: number;
  count: number;
};

/**
 * A pool's commitment tree data, as zcore reads it: the tip body and frozen
 * chunks, base64, and for a crossing lightwalletd's tree at its anchor (hex).
 */
export type PoolTrees = {
  tip: string;
  chunks: [number, string][];
  bucket?: string;
};

export type TxTrees = Partial<Record<Pool, PoolTrees>>;

/** zcore's wallet snapshot: unspent notes and UTXOs, and the chain tip. */
export type WalletSnapshot = {
  tip: number;
  notes: {
    pool: Pool;
    scope: string;
    note: string;
    txid: string;
    output_index: number;
    position: number;
    height: number;
  }[];
  utxos: {
    txid: string;
    index: number;
    value: number;
    address: string;
    height: number;
    scope: string;
    address_index: number;
  }[];
};

/** zcore's send request; `amount` in zatoshis. */
export type SendTxRequest = {
  to: string;
  amount: number;
  memo?: string;
  memo_hex?: string;
  from: "shielded" | "transparent" | "orchard";
  bucket?: number;
};

/** The transaction the Keychain builds, has the user approve, signs and proves. */
export type SendTxProps = {
  /** The paying account's address, as for `sign`. */
  signer: string;
  /** The shielded account whose notes `wallet` holds; the site's own when omitted. */
  account?: string;
  wallet: WalletSnapshot;
  trees: TxTrees;
} & (
  | { kind: "send"; send: SendTxRequest; changeIndex?: number }
  | { kind: "shield" }
  /** A ZIP 318 migration's next preparation, for these parts (zatoshis). */
  | { kind: "preparation"; parts: number[] }
);

/** A payment link's note, claimed into the site's account. */
export type ClaimLinkProps = {
  /** The shielded account it's claimed into; the site's own when omitted. */
  account?: string;
  /** The link's key, base64. */
  key: string;
  note: string;
  position: number;
  trees: TxTrees;
  tip: number;
};

/** A proven transaction, ready to broadcast; `raw` is base64. */
export type ProvedTx = { txid: string; raw: string; expiryHeight: number };

/** The slow steps of proving, as each starts. */
export type ProveStage =
  | "sapling-params"
  | "sapling-proofs"
  | "proving-key"
  | "orchard-proof"
  | "ironwood-proof"
  | "verifying";
