/* tslint:disable */
/* eslint-disable */
export function start(): void;
/**
 * Installs the Sapling proving parameters (sapling-spend.params and
 * sapling-output.params bytes). Must be called before any proving or sending
 * operation. Idempotent: subsequent calls are no-ops.
 *
 * Panics if the bytes do not match the expected parameter hashes, so callers
 * should verify integrity before passing them in.
 */
export function initSaplingParams(spend_bytes: Uint8Array, output_bytes: Uint8Array): void;
/**
 * Returns whether the Sapling proving parameters have been loaded.
 */
export function saplingParamsLoaded(): boolean;
/**
 * Returns the package name and git commit hash this WASM was built from.
 * Use this to verify the app and extension are running the same build.
 *
 * Example: `"zillions-sdk-keys git=bf0769b"`
 */
export function zillions_build_info(): string;
/**
 * Generate a new BIP39 24-word seed phrase
 *
 * IMPORTANT: This probably does not use secure randomness when used in the browser
 * and should not be used for anything other than testing
 *
 * # Returns
 *
 * A string containing a 24-word seed phrase
 */
export function generate_seed_phrase(): string;
/**
 * Signs and applies signatures to a PCZT.
 * Should in a secure environment (e.g. Metamask snap).
 *
 * # Arguments
 *
 * * `pczt` - The PCZT that needs to signed
 * * `usk` - UnifiedSpendingKey used to sign the PCZT
 * * `seed_fp` - The fingerprint of the seed used to create `usk`
 */
export function pczt_sign(network: string, pczt: Pczt, usk: UnifiedSpendingKey, seed_fp: SeedFingerprint): Promise<Pczt>;
/**
 * Entry point for web workers
 */
export function wasm_thread_entry_point(ptr: number): void;
export function initThreadPool(num_threads: number): Promise<any>;
export function wbg_rayon_start_worker(receiver: number): void;
/**
 * The status of a transaction
 */
export enum TransactionStatusType {
  /**
   * Transaction has been mined
   */
  Confirmed = 0,
  /**
   * Transaction is waiting to be mined
   */
  Pending = 1,
  /**
   * Transaction has expired without being mined
   */
  Expired = 2,
}
/**
 * The type of transaction
 */
export enum TransactionType {
  /**
   * Funds received from external source
   */
  Received = 0,
  /**
   * Funds sent to external recipient
   */
  Sent = 1,
  /**
   * Transparent funds moved into the shielded pool
   */
  Shielded = 2,
  /**
   * Shielded funds moved into the transparent pool
   */
  Unshielded = 3,
  /**
   * Internal transfer with no transparent leg: a sapling<->orchard pool
   * migration
   */
  Migrated = 4,
}
/**
 * The `ReadableStreamType` enum.
 *
 * *This API requires the following crate features to be activated: `ReadableStreamType`*
 */
type ReadableStreamType = "bytes";

export interface PcztTransparentIoJson {
  value?: number;
  user_address?: string;
  [key: string]: unknown;
}

export interface PcztSaplingSpendJson {
  value?: number;
  [key: string]: unknown;
}

export interface PcztOrchardActionJson {
  spend?: { value?: number; [key: string]: unknown };
  output?: { value?: number; user_address?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface PcztJson {
  global?: {
    tx_version?: number;
    version_group_id?: number;
    consensus_branch_id?: number;
    fallback_lock_time?: number;
    expiry_height?: number;
    /** SLIP-44 coin type; use this to identify the target network, not a `network` field. */
    coin_type?: number;
    /** Bitfield: transparent inputs/outputs modifiable flags (see `pczt::common::Global`). */
    tx_modifiable?: number;
    proprietary?: Record<string, number[]>;
    [key: string]: unknown;
  };
  transparent?: {
    inputs?: PcztTransparentIoJson[];
    outputs?: PcztTransparentIoJson[];
    [key: string]: unknown;
  };
  sapling?: {
    spends?: PcztSaplingSpendJson[];
    outputs?: Record<string, unknown>[];
    /** Net Sapling value balance (spends - outputs); i128 has no safe `number` form. */
    value_sum?: bigint;
    [key: string]: unknown;
  };
  orchard?: {
    actions?: PcztOrchardActionJson[];
    value_sum?: [number, boolean];
    [key: string]: unknown;
  };
}


export class BlockRange {
  private constructor();
  free(): void;
  0: number;
  1: number;
}
export class IntoUnderlyingByteSource {
  private constructor();
  free(): void;
  start(controller: ReadableByteStreamController): void;
  pull(controller: ReadableByteStreamController): Promise<any>;
  cancel(): void;
  readonly type: ReadableStreamType;
  readonly autoAllocateChunkSize: number;
}
export class IntoUnderlyingSink {
  private constructor();
  free(): void;
  write(chunk: any): Promise<any>;
  close(): Promise<any>;
  abort(reason: any): Promise<any>;
}
export class IntoUnderlyingSource {
  private constructor();
  free(): void;
  pull(controller: ReadableStreamDefaultController): Promise<any>;
  cancel(): void;
}
export class Pczt {
  private constructor();
  free(): void;
  /**
   * Returns a JSON object with the details of the Pczt. See `PcztJson` for the shape.
   */
  to_json(): PcztJson;
  /**
   * Returns a Pczt from a JSON object
   */
  static from_json(s: any): Pczt;
  /**
   * Returns the postcard serialization of the Pczt.
   */
  serialize(): Uint8Array;
  /**
   * Deserialize to a Pczt from postcard bytes.
   */
  static from_bytes(bytes: Uint8Array): Pczt;
  /**
   * Returns the transaction fee, in zatoshis, implied by this PCZT's bundle balances.
   *
   * Computed as transparent value in minus transparent value out, plus the net
   * Sapling and Orchard value balances (each already spends-minus-outputs). This is
   * the ZIP-317 fee that was applied when the PCZT was created, and does not change
   * as the PCZT is signed, proved, or combined.
   */
  fee(): bigint;
}
/**
 * A Zcash Sapling proof generation key
 *
 * This is a wrapper around the `sapling::ProofGenerationKey` type. It is used for generating proofs for Sapling PCZTs.
 */
export class ProofGenerationKey {
  private constructor();
  free(): void;
}
/**
 * A handler to an immutable proposal. This can be passed to `create_proposed_transactions` to prove/authorize the transactions
 * before they are sent to the network.
 *
 * The proposal can be reviewed by calling `describe` which will return a JSON object with the details of the proposal.
 */
export class Proposal {
  private constructor();
  free(): void;
}
/**
 * A ZIP32 seed fingerprint. Essentially a Blake2b hash of the seed.
 *
 * This is a wrapper around the `zip32::fingerprint::SeedFingerprint` type.
 */
export class SeedFingerprint {
  free(): void;
  /**
   * Construct a new SeedFingerprint
   *
   * # Arguments
   *
   * * `seed` - At least 32 bytes of entry. Care should be taken as to how this is derived
   */
  constructor(seed: Uint8Array);
  to_bytes(): Uint8Array;
  static from_bytes(bytes: Uint8Array): SeedFingerprint;
}
/**
 * A single transaction history entry
 */
export class TransactionHistoryEntry {
  private constructor();
/**
** Return copy of self without private attributes.
*/
  toJSON(): Object;
/**
* Return stringified version of self.
*/
  toString(): string;
  free(): void;
  readonly txid: string;
  readonly tx_type: TransactionType;
  readonly value: bigint;
  readonly fee: bigint | undefined;
  readonly block_height: number | undefined;
  readonly confirmations: number;
  readonly status: TransactionStatusType;
  readonly memo: string | undefined;
  readonly timestamp: bigint | undefined;
  readonly pool: string;
  readonly to_address: string | undefined;
  readonly from_address: string | undefined;
}
/**
 * Response containing paginated transaction history
 */
export class TransactionHistoryResponse {
  private constructor();
/**
** Return copy of self without private attributes.
*/
  toJSON(): Object;
/**
* Return stringified version of self.
*/
  toString(): string;
  free(): void;
  readonly transactions: any;
  readonly total_count: number;
  readonly has_more: boolean;
}
/**
 * A Zcash viewing key
 *
 * This is a wrapper around the `zcash_keys::keys::ViewingKey` type.
 * UFVKs should be generated from a spending key by calling `to_unified_full_viewing_key`
 * They can also be encoded and decoded to a canonical string representation
 */
export class UnifiedFullViewingKey {
  free(): void;
  /**
   * Encode the UFVK to a string
   *
   * # Arguments
   *
   * * `network` - Must be either "main" or "test"
   */
  encode(network: string): string;
  /**
   * Construct a UFVK from its encoded string representation
   *
   * # Arguments
   *
   * * `network` - Must be either "main" or "test"
   * * `encoding` - The encoded string representation of the UFVK
   */
  constructor(network: string, encoding: string);
  /**
   * Get the default transparent address derived from this UFVK.
   *
   * This can be used before creating an account to detect the wallet birthday
   * by querying for transactions to this address.
   *
   * # Arguments
   *
   * * `network` - Must be either "main" or "test"
   *
   * # Returns
   *
   * The transparent address as a string, or None if this UFVK has no transparent component.
   */
  get_transparent_address(network: string): string | undefined;
  /**
   * Decisive "is this MY address?" test for an external unified address.
   *
   * Decodes `addr` and checks whether its orchard / sapling receivers belong
   * to THIS UFVK's incoming viewing keys. If they do, returns the diversifier
   * index at which the receiver sits (proving it is the same wallet/keys, just
   * a different diversifier). Returns `Ok(None)` if the address does not belong
   * to this UFVK (i.e. genuinely different keys). Fully OFFLINE.
   *
   * Result format: `"orchard:<j>"` or `"sapling:<j>"` (j as decimal u128), or
   * `None`.
   */
  ua_diversifier_index(network: string, addr: string): string | undefined;
  /**
   * Derive the unified address at an EXPLICIT diversifier index `j` for a
   * chosen receiver set (orchard / sapling / transparent each Allow|Omit).
   *
   * Returns `Ok(None)` if `j` is not a valid diversifier for the requested
   * receivers (sapling/transparent are only valid at ~half of all indices),
   * or if the receiver request itself is impossible. Used to enumerate the
   * diversifier space and locate the exact index another wallet used.
   * Fully OFFLINE: pure key math, no network.
   */
  get_unified_address_at(network: string, orchard: boolean, sapling: boolean, p2pkh: boolean, j: bigint): string | undefined;
  /**
   * Get the default unified address derived from this UFVK.
   *
   * Uses the `SHIELDED` receiver request — **orchard + sapling, no
   * transparent receiver** — matching the default unified address shown by
   * standard Zcash wallets (e.g. the Zcash mobile SDK). (Bundling the
   * transparent receiver via `ALLOW_ALL` produces a different, non-matching
   * `u1…` string.) ZIP-316 encoded. Fully OFFLINE: pure key math, no network.
   *
   * # Arguments
   *
   * * `network` - Must be either "main" or "test"
   */
  get_unified_address(network: string): string;
}
/**
 * A Zcash spending key
 *
 * This is a wrapper around the `zcash_keys::keys::SpendingKey` type. It can be created from at least 32 bytes of seed entropy
 */
export class UnifiedSpendingKey {
  free(): void;
  /**
   * Construct a new UnifiedSpendingKey
   *
   * # Arguments
   *
   * * `network` - Must be either "main" or "test"
   * * `seed` - At least 32 bytes of entry. Care should be taken as to how this is derived
   * * `hd_index` - [ZIP32](https://zips.z.cash/zip-0032) hierarchical deterministic index of the account
   */
  constructor(network: string, seed: Uint8Array, hd_index: number);
  /**
   * Encode this account's Sapling extended spending key as the canonical
   * Bech32 string (`secret-extended-key-main1…` / `…test1…`).
   *
   * Unlike `to_bytes_hex` (the full unified spending key, non-portable), this
   * IS a standard, importable encoding — but it covers ONLY the Sapling pool,
   * not Orchard/transparent. Surfaced alongside the unified key so the popup
   * can show both. Fully OFFLINE.
   */
  sapling_extended_spending_key(network: string): string;
  /**
   * Serialize this unified spending key to its librustzcash byte encoding
   * (current Orchard era), hex-encoded.
   *
   * SECURITY: this is the account's spending secret — it can spend ALL funds
   * in this account across every pool. It is account-scoped: it does NOT
   * reveal the wallet seed phrase or any sibling account. The encoding is the
   * non-canonical librustzcash local-storage format (era byte + typecode TLV
   * of the constituent keys), NOT a portable ZIP-316 string, so it is not
   * importable by other wallets.
   */
  to_bytes_hex(): string;
  /**
   * Construct a UnifiedSpendingKey directly from a BIP39 mnemonic phrase.
   * Derives the BIP39 seed (empty passphrase) in-wasm. Fully OFFLINE.
   */
  static from_seed_phrase(network: string, phrase: string, hd_index: number): UnifiedSpendingKey;
  /**
   * Obtain the UFVK corresponding to this spending key
   */
  to_unified_full_viewing_key(): UnifiedFullViewingKey;
  to_sapling_proof_generation_key(): ProofGenerationKey;
}
export class WalletSummary {
  private constructor();
/**
** Return copy of self without private attributes.
*/
  toJSON(): Object;
/**
* Return stringified version of self.
*/
  toString(): string;
  free(): void;
  chain_tip_height: number;
  fully_scanned_height: number;
  /**
   * Overall scan progress as a ratio; percent = numerator / denominator.
   */
  scan_progress_numerator: bigint;
  scan_progress_denominator: bigint;
  next_sapling_subtree_index: bigint;
  next_orchard_subtree_index: bigint;
  readonly account_balances: any;
}
/**
 * # A Zcash wallet
 *
 * This is the main entry point for interacting with this library.
 * For the most part you will only need to create and interact with a Wallet instance.
 *
 * A wallet is a set of accounts that can be synchronized together with the blockchain.
 * Once synchronized, the wallet can be used to propose, build and send transactions.
 *
 * Create a new WebWallet with
 * ```javascript
 * const wallet = new WebWallet("main", "https://zcash-mainnet.chainsafe.dev", 10);
 * ```
 *
 * ## Adding Accounts
 *
 * Accounts can be added by either importing a seed phrase or a Unified Full Viewing Key (UFVK).
 * If you do import via a UFVK it is important that you also have access to the Unified Spending Key (USK) for that account otherwise the wallet will not be able to create transactions.
 *
 * When importing an account you can also specify the block height at which the account was created. This can significantly reduce the time it takes to sync the account as the wallet will only scan for transactions after this height.
 * Failing to provide a birthday height will result in extremely slow sync times as the wallet will need to scan the entire blockchain.
 *
 * e.g.
 * ```javascript
 * const account_id = await wallet.create_account("...", 1, 2657762)
 *
 * // OR
 *
 * const account_id = await wallet.import_ufvk("...", 2657762)
 * ``
 *
 * ## Synchronizing
 *
 * Syncing is driven from JS by the `syncWallet` engine in `@zillions/sdk`, which composes the
 * wallet's sync-stage methods: `sync_update_subtree_roots`, `sync_update_chain_tip`,
 * `sync_refresh_utxos`, and `sync_scan_range`, consulting `suggest_scan_ranges` between scans.
 * Driving the loop from JS lets callers observe progress and checkpoint the wallet database
 * (`db_to_bytes`) between batches so syncing survives page reloads.
 *
 * The CPU-heavy stages run in a dedicated WebWorker so the main thread is not blocked. It is
 * safe to call other methods on the wallet while syncing although they may take longer than
 * usual while they wait for a write-lock to be released.
 *
 * ```javascript
 * import { syncWallet } from "@zillions/sdk";
 * await syncWallet(wallet, { onProgress: (p) => console.log(p.percent) });
 * ```
 *
 * ## Transacting
 *
 * Sending a transaction is a three step process: proposing, authorizing, and sending.
 *
 * A transaction proposal is created by calling `propose_transfer` with the intended recipient and amount. This will create a proposal object that describes which notes will be spent in order to fulfil this request.
 * The proposal should be presented to the user for review before being authorized.
 *
 * To authorize the transaction the caller must currently provide the seed phrase and account index of the account that will be used to sign the transaction. This method also perform the SNARK proving which is an expensive operation and performed in parallel by a series of WebWorkers.
 *
 * Finally, A transaction can be sent to the network by calling `send_authorized_transactions` with the list of transaction IDs that were generated by the authorization step.
 *
 * ## PCZT Transactions
 *
 * PCZT (Partially Constructed Zcash Transaction)
 *
 * 1. **`pczt_create_from_shielded`** - Creates a PCZT which designates how funds from this account can be spent to realize the requested transfer (does NOT sign, generate proofs, or send)
 * 2. **`pczt_sign`** - Signs the PCZT using USK (should be done in secure environment)
 * 3. **`pczt_prove`** - Creates and inserts proofs for the PCZT
 *
 * The full flow looks like
 * The full PCZT flow: `pczt_create_from_shielded` → `pczt_sign` → `pczt_prove` → `pczt_send`
 * ```
 */
export class WebWallet {
  free(): void;
  /**
   * Create a new instance of a Zcash wallet for a given network. Only one instance should be created per page.
   *
   * # Arguments
   *
   * * `network` - Must be one of "main" or "test"
   * * `lightwalletd_url` - Url of the lightwalletd instance to connect to (e.g. https://zcash-mainnet.chainsafe.dev)
   * * `min_confirmations` - Number of confirmations required before a transaction is considered final
   * * `db_bytes` - (Optional) UInt8Array of a serialized wallet database. This can be used to restore a wallet from a previous session that was serialized by `db_to_bytes`
   *
   * # Examples
   *
   * ```javascript
   * const wallet = new WebWallet("main", "https://zcash-mainnet.chainsafe.dev", 10);
   * ```
   */
  constructor(network: string, lightwalletd_url: string, min_confirmations_trusted: number, min_confirmations_untrusted: number, db_bytes?: Uint8Array | null);
  /**
   * Add a new account to the wallet using a given seed phrase
   *
   * # Arguments
   *
   * * `seed_phrase` - 24 word mnemonic seed phrase
   * * `account_hd_index` - [ZIP32](https://zips.z.cash/zip-0032) hierarchical deterministic index of the account
   * * `birthday_height` - Block height at which the account was created. The sync logic will assume no funds are send or received prior to this height which can VERY significantly reduce sync time
   *
   * # Examples
   *
   * ```javascript
   * const wallet = new WebWallet("main", "https://zcash-mainnet.chainsafe.dev", 10);
   * const account_id = await wallet.create_account("...", 1, 2657762)
   * ```
   */
  create_account(account_name: string, seed_phrase: string, account_hd_index: number, birthday_height?: number | null): Promise<number>;
  /**
   * Add a new account to the wallet by directly importing a Unified Full Viewing Key (UFVK)
   *
   * # Arguments
   *
   * * `key` - [ZIP316](https://zips.z.cash/zip-0316) encoded UFVK
   * * `birthday_height` - Block height at which the account was created. The sync logic will assume no funds are send or received prior to this height which can VERY significantly reduce sync time
   *
   * # Examples
   *
   * ```javascript
   * const wallet = new WebWallet("main", "https://zcash-mainnet.chainsafe.dev", 10);
   * const account_id = await wallet.import_ufvk("...", 2657762)
   * ```
   */
  create_account_ufvk(account_name: string, encoded_ufvk: string, seed_fingerprint: SeedFingerprint, account_hd_index: number, birthday_height?: number | null): Promise<number>;
  /**
   * Add a new view-only account to the wallet by directly importing a Unified Full Viewing Key (UFVK)
   *
   * # Arguments
   *
   * * `key` - [ZIP316](https://zips.z.cash/zip-0316) encoded UFVK
   * * `birthday_height` - Block height at which the account was created. The sync logic will assume no funds are send or received prior to this height which can VERY significantly reduce sync time
   *
   * # Examples
   *
   * ```javascript
   * const wallet = new WebWallet("main", "https://zcash-mainnet.chainsafe.dev", 10);
   * const account_id = await wallet.import_ufvk("...", 2657762)
   * ```
   */
  create_account_view_ufvk(account_name: string, encoded_ufvk: string, birthday_height?: number | null): Promise<number>;
  /**
   * Sync stage: fetch the note commitment subtree roots from the
   * lightwalletd server and store them in the wallet. Call once before the
   * first `sync_scan_range` of a session.
   */
  sync_update_subtree_roots(): Promise<void>;
  /**
   * Sync stage: fetch the current chain tip from the lightwalletd server
   * and update the wallet's scan queue. Returns the tip height.
   */
  sync_update_chain_tip(): Promise<number>;
  /**
   * Sync stage: refresh the wallet's view of transparent UTXOs for all
   * accounts. Run before shielded scanning.
   */
  sync_refresh_utxos(): Promise<void>;
  /**
   * Sync stage: download full data for scanner-discovered transactions
   * (recovering sent outputs, recipient addresses, memos and fees) and
   * fetch the transaction history of the wallet's transparent addresses.
   * Run after scanning, once the suggested ranges drain.
   */
  sync_enhance_transactions(): Promise<void>;
  /**
   * Sync stage: download and scan the compact blocks in `[start, end)`.
   *
   * The CPU-heavy trial decryption runs in a dedicated webworker (plus the
   * rayon pool), so the main thread stays responsive. Wallet methods may
   * temporarily block while the wallet is written to during the scan.
   *
   * Callers must re-request `suggest_scan_ranges` after every call:
   * scanning can reprioritize ranges, or rewind the wallet after a reorg.
   */
  sync_scan_range(start: number, end: number): Promise<void>;
  /**
   * Ranges of blocks the wallet wants scanned, most urgent first, as
   * `[start, end]` pairs (end exclusive). Empty means fully synced as of
   * the last `sync_update_chain_tip`.
   */
  suggest_scan_ranges(): Promise<any>;
  get_wallet_summary(): Promise<WalletSummary | undefined>;
  /**
   * Create a new transaction proposal to send funds to a given address
   *
   * Not this does NOT sign, generate a proof, or send the transaction. It will only craft the proposal which designates how notes from this account can be spent to realize the requested transfer.
   *
   * # Arguments
   *
   * * `account_id` - The ID of the account in this wallet to send funds from
   * * `to_address` - [ZIP316](https://zips.z.cash/zip-0316) encoded address to send funds to
   * * `value` - Amount to send in Zatoshis (1 ZEC = 100_000_000 Zatoshis)
   *
   * # Returns
   *
   * A proposal object which can be inspected and later used to generate a valid transaction
   *
   * # Examples
   *
   * ```javascript
   * const proposal = await wallet.propose_transfer(1, "u18rakpts0de589sx9dkamcjms3apruqqax9k2s6e7zjxx9vv5kc67pks2trg9d3nrgd5acu8w8arzjjuepakjx38dyxl6ahd948w0mhdt9jxqsntan6px3ysz80s04a87pheg2mqvlzpehrgup7568nfd6ez23xd69ley7802dfvplnfn7c07vlyumcnfjul4pvv630ac336rjhjyak5", 100000000);
   * ```
   */
  propose_transfer(account_id: number, to_address: string, value: bigint): Promise<Proposal>;
  /**
   * Generate a valid Zcash transaction from a given proposal
   *
   * IMPORTANT: This will spawn a new webworker which will handle the proving task which may take 10s of seconds
   *
   * # Arguments
   *
   * * `proposal` - A proposal object generated by `propose_transfer`
   * * `seed_phrase` - 24 word mnemonic seed phrase. This MUST correspond to the accountID used when creating the proposal.
   * * `account_hd_index` - [ZIP32](https://zips.z.cash/zip-0032) hierarchical deterministic index of the account. This MUST correspond to the accountID used when creating the proposal.
   *
   * # Returns
   *
   * A list of transaction IDs which can be used to track the status of the transaction on the network.
   * It is returned in a flattened form where each ID is 32 bytes.
   * The transactions themselves are stored within the wallet.
   *
   * # Examples
   *
   * ```javascript
   * const proposal = await wallet.propose_transfer(1, "u18rakpts0de589sx9dkamcjms3apruqqax9k2s6e7zjxx9vv5kc67pks2trg9d3nrgd5acu8w8arzjjuepakjx38dyxl6ahd948w0mhdt9jxqsntan6px3ysz80s04a87pheg2mqvlzpehrgup7568nfd6ez23xd69ley7802dfvplnfn7c07vlyumcnfjul4pvv630ac336rjhjyak5", 100000000);
   * const authorized_txns = await wallet.create_proposed_transactions(proposal, "...", 1);
   * ```
   */
  create_proposed_transactions(proposal: Proposal, seed_phrase: string, account_hd_index: number): Promise<Uint8Array>;
  /**
   * Serialize the internal wallet database to bytes
   *
   * This should be used for persisting the wallet between sessions. The resulting byte array can be used to construct a new wallet instance.
   * Note this method is async and will block until a read-lock can be acquired on the wallet database
   *
   * # Returns
   *
   * A postcard encoded byte array of the wallet database
   */
  db_to_bytes(): Promise<Uint8Array>;
  /**
   * Send a list of authorized transactions to the network to be included in the blockchain
   *
   * These will be sent via the connected lightwalletd instance
   *
   * # Arguments
   *
   * * `txids` - A list of transaction IDs (typically generated by `create_proposed_transactions`). It is in flatten form which means it's just a concatination of the 32 byte IDs.
   *
   * # Examples
   *
   * ```javascript
   * const proposal = wallet.propose_transfer(1, "u18rakpts0de589sx9dkamcjms3apruqqax9k2s6e7zjxx9vv5kc67pks2trg9d3nrgd5acu8w8arzjjuepakjx38dyxl6ahd948w0mhdt9jxqsntan6px3ysz80s04a87pheg2mqvlzpehrgup7568nfd6ez23xd69ley7802dfvplnfn7c07vlyumcnfjul4pvv630ac336rjhjyak5", 100000000);
   * const authorized_txns = wallet.create_proposed_transactions(proposal, "...", 1);
   * await wallet.send_authorized_transactions(authorized_txns);
   * ```
   */
  send_authorized_transactions(txids: Uint8Array): Promise<void>;
  /**
   * Get the current unified address for a given account. This is returned as a string in canonical encoding
   *
   * # Arguments
   *
   * * `account_id` - The ID of the account to get the address for
   */
  get_current_address(account_id: number): Promise<string>;
  /**
   * Create a Shielding PCZT (Partially Constructed Zcash Transaction).
   *
   * A Proposal for shielding funds is created and the the PCZT is constructed for it
   *
   * # Arguments
   *
   * * `account_id` - The ID of the account which transparent funds will be shielded.
   * * `value` - (Optional) Amount to shield in Zatoshis. When omitted, all
   *   transparent funds above the shielding threshold are swept. When given,
   *   whole UTXOs are selected to cover at least this amount, so the shielded
   *   value may exceed it; no transparent change is created.
   */
  pczt_shield(account_id: number, value?: bigint | null): Promise<Pczt>;
  /**
   * Creates a PCZT (Partially Constructed Zcash Transaction).
   *
   * A Proposal is created similar to `create_proposed_transactions` and then a PCZT is constructed from it.
   * Note: This does NOT sign, generate a proof, or send the transaction.
   * It will only craft the PCZT which designates how notes from this account can be spent to realize the requested transfer.
   * The PCZT will still need to be signed and proofs will need to be generated before sending.
   *
   * # Arguments
   *
   * * `account_id` - The ID of the account in this wallet to send funds from
   * * `to_address` - [ZIP316](https://zips.z.cash/zip-0316) encoded address to send funds to
   * * `value` - Amount to send in Zatoshis (1 ZEC = 100_000_000 Zatoshis)
   */
  pczt_create_from_shielded(account_id: number, to_address: string, value: bigint): Promise<Pczt>;
  /**
   * Creates a PCZT spending transparent funds.
   *
   * Selects transparent UTXOs to cover the requested value plus the ZIP-317 fee.
   * For transparent recipients, change returns to the funding transparent address;
   * for shielded recipients, change is auto-shielded into the account's Orchard pool.
   * Like `pczt_create_from_shielded`, this does NOT sign, prove, or send.
   *
   * # Arguments
   *
   * * `account_id` - The ID of the account in this wallet to send funds from
   * * `to_address` - [ZIP316](https://zips.z.cash/zip-0316) encoded address to send funds to (transparent or shielded)
   * * `value` - Amount to send in Zatoshis (1 ZEC = 100_000_000 Zatoshis)
   */
  pczt_create_from_transparent(account_id: number, to_address: string, value: bigint): Promise<Pczt>;
  /**
   * Creates and inserts proofs for a PCZT.
   *
   * Sapling spends must already carry their proof generation key, attached
   * by the keychain's `pczt_sign` during signing.
   *
   * # Arguments
   *
   * * `pczt` - The PCZT that needs to be proven
   */
  pczt_prove(pczt: Pczt): Promise<Pczt>;
  pczt_send(pczt: Pczt): Promise<void>;
  pczt_combine(pczts: Pczt[]): Pczt;
  /**
   * Get the current unified address for a given account and extracts the transparent component. This is returned as a string in canonical encoding
   *
   * # Arguments
   *
   * * `account_id` - The ID of the account to get the address for
   */
  get_current_address_transparent(account_id: number): Promise<string>;
  /**
   * Get transaction history for an account
   *
   * # Arguments
   *
   * * `account_id` - The ID of the account to get transaction history for
   * * `limit` - Maximum number of transactions to return (default: 50)
   * * `offset` - Number of transactions to skip for pagination (default: 0)
   *
   * # Returns
   *
   * A TransactionHistoryResponse containing the list of transactions, total count, and pagination info
   *
   * # Examples
   *
   * ```javascript
   * const history = await wallet.get_transaction_history(0, 50, 0);
   * console.log(history.transactions);
   * ```
   */
  get_transaction_history(account_id: number, limit?: number | null, offset?: number | null): Promise<TransactionHistoryResponse>;
  /**
   *
   * Get the highest known block height from the connected lightwalletd instance
   */
  get_latest_block(): Promise<bigint>;
  /**
   * Detect the wallet birthday by querying for the first transaction to a transparent address.
   *
   * This queries the lightwalletd server for all transactions to the given transparent address
   * and returns the block height of the earliest transaction, minus a safety buffer.
   *
   * # Arguments
   *
   * * `transparent_address` - A transparent Zcash address (t-address)
   *
   * # Returns
   *
   * The detected birthday height, or None if no transactions were found.
   * Returns the earliest transaction height minus 100 blocks as a safety buffer.
   */
  detect_birthday_from_transparent_address(transparent_address: string): Promise<number | undefined>;
}
export class wbg_rayon_PoolBuilder {
  private constructor();
  free(): void;
  numThreads(): number;
  receiver(): number;
  build(): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly __wbg_proposal_free: (a: number, b: number) => void;
  readonly __wbg_transactionhistoryentry_free: (a: number, b: number) => void;
  readonly transactionhistoryentry_txid: (a: number) => [number, number];
  readonly transactionhistoryentry_tx_type: (a: number) => number;
  readonly transactionhistoryentry_value: (a: number) => bigint;
  readonly transactionhistoryentry_fee: (a: number) => [number, bigint];
  readonly transactionhistoryentry_block_height: (a: number) => number;
  readonly transactionhistoryentry_confirmations: (a: number) => number;
  readonly transactionhistoryentry_status: (a: number) => number;
  readonly transactionhistoryentry_memo: (a: number) => [number, number];
  readonly transactionhistoryentry_timestamp: (a: number) => [number, bigint];
  readonly transactionhistoryentry_pool: (a: number) => [number, number];
  readonly transactionhistoryentry_to_address: (a: number) => [number, number];
  readonly transactionhistoryentry_from_address: (a: number) => [number, number];
  readonly __wbg_transactionhistoryresponse_free: (a: number, b: number) => void;
  readonly transactionhistoryresponse_transactions: (a: number) => any;
  readonly transactionhistoryresponse_total_count: (a: number) => number;
  readonly transactionhistoryresponse_has_more: (a: number) => number;
  readonly __wbg_webwallet_free: (a: number, b: number) => void;
  readonly webwallet_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
  readonly webwallet_create_account: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => any;
  readonly webwallet_create_account_ufvk: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => any;
  readonly webwallet_create_account_view_ufvk: (a: number, b: number, c: number, d: number, e: number, f: number) => any;
  readonly webwallet_sync_update_subtree_roots: (a: number) => any;
  readonly webwallet_sync_update_chain_tip: (a: number) => any;
  readonly webwallet_sync_refresh_utxos: (a: number) => any;
  readonly webwallet_sync_enhance_transactions: (a: number) => any;
  readonly webwallet_sync_scan_range: (a: number, b: number, c: number) => any;
  readonly webwallet_suggest_scan_ranges: (a: number) => any;
  readonly webwallet_get_wallet_summary: (a: number) => any;
  readonly webwallet_propose_transfer: (a: number, b: number, c: number, d: number, e: bigint) => any;
  readonly webwallet_create_proposed_transactions: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly webwallet_db_to_bytes: (a: number) => any;
  readonly webwallet_send_authorized_transactions: (a: number, b: number, c: number) => any;
  readonly webwallet_get_current_address: (a: number, b: number) => any;
  readonly webwallet_pczt_shield: (a: number, b: number, c: number, d: bigint) => any;
  readonly webwallet_pczt_create_from_shielded: (a: number, b: number, c: number, d: number, e: bigint) => any;
  readonly webwallet_pczt_create_from_transparent: (a: number, b: number, c: number, d: number, e: bigint) => any;
  readonly webwallet_pczt_prove: (a: number, b: number) => any;
  readonly webwallet_pczt_send: (a: number, b: number) => any;
  readonly webwallet_pczt_combine: (a: number, b: number, c: number) => [number, number, number];
  readonly webwallet_get_current_address_transparent: (a: number, b: number) => any;
  readonly webwallet_get_transaction_history: (a: number, b: number, c: number, d: number) => any;
  readonly webwallet_get_latest_block: (a: number) => any;
  readonly webwallet_detect_birthday_from_transparent_address: (a: number, b: number, c: number) => any;
  readonly __wbg_walletsummary_free: (a: number, b: number) => void;
  readonly __wbg_get_walletsummary_chain_tip_height: (a: number) => number;
  readonly __wbg_set_walletsummary_chain_tip_height: (a: number, b: number) => void;
  readonly __wbg_get_walletsummary_fully_scanned_height: (a: number) => number;
  readonly __wbg_set_walletsummary_fully_scanned_height: (a: number, b: number) => void;
  readonly __wbg_get_walletsummary_scan_progress_numerator: (a: number) => bigint;
  readonly __wbg_set_walletsummary_scan_progress_numerator: (a: number, b: bigint) => void;
  readonly __wbg_get_walletsummary_scan_progress_denominator: (a: number) => bigint;
  readonly __wbg_set_walletsummary_scan_progress_denominator: (a: number, b: bigint) => void;
  readonly __wbg_get_walletsummary_next_sapling_subtree_index: (a: number) => bigint;
  readonly __wbg_set_walletsummary_next_sapling_subtree_index: (a: number, b: bigint) => void;
  readonly __wbg_get_walletsummary_next_orchard_subtree_index: (a: number) => bigint;
  readonly __wbg_set_walletsummary_next_orchard_subtree_index: (a: number, b: bigint) => void;
  readonly walletsummary_account_balances: (a: number) => any;
  readonly start: () => void;
  readonly initSaplingParams: (a: number, b: number, c: number, d: number) => void;
  readonly saplingParamsLoaded: () => number;
  readonly __wbg_blockrange_free: (a: number, b: number) => void;
  readonly __wbg_get_blockrange_0: (a: number) => number;
  readonly __wbg_set_blockrange_0: (a: number, b: number) => void;
  readonly __wbg_get_blockrange_1: (a: number) => number;
  readonly __wbg_set_blockrange_1: (a: number, b: number) => void;
  readonly __wbg_wbg_rayon_poolbuilder_free: (a: number, b: number) => void;
  readonly wbg_rayon_poolbuilder_numThreads: (a: number) => number;
  readonly wbg_rayon_poolbuilder_receiver: (a: number) => number;
  readonly wbg_rayon_poolbuilder_build: (a: number) => void;
  readonly initThreadPool: (a: number) => any;
  readonly wbg_rayon_start_worker: (a: number) => void;
  readonly zillions_build_info: () => [number, number];
  readonly __wbg_seedfingerprint_free: (a: number, b: number) => void;
  readonly seedfingerprint_new: (a: number, b: number) => [number, number, number];
  readonly seedfingerprint_to_bytes: (a: number) => [number, number];
  readonly seedfingerprint_from_bytes: (a: number, b: number) => [number, number, number];
  readonly __wbg_proofgenerationkey_free: (a: number, b: number) => void;
  readonly __wbg_unifiedspendingkey_free: (a: number, b: number) => void;
  readonly unifiedspendingkey_new: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
  readonly unifiedspendingkey_sapling_extended_spending_key: (a: number, b: number, c: number) => [number, number, number, number];
  readonly unifiedspendingkey_to_bytes_hex: (a: number) => [number, number];
  readonly unifiedspendingkey_from_seed_phrase: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
  readonly unifiedspendingkey_to_unified_full_viewing_key: (a: number) => number;
  readonly unifiedspendingkey_to_sapling_proof_generation_key: (a: number) => number;
  readonly __wbg_unifiedfullviewingkey_free: (a: number, b: number) => void;
  readonly unifiedfullviewingkey_encode: (a: number, b: number, c: number) => [number, number, number, number];
  readonly unifiedfullviewingkey_new: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly unifiedfullviewingkey_get_transparent_address: (a: number, b: number, c: number) => [number, number, number, number];
  readonly unifiedfullviewingkey_ua_diversifier_index: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
  readonly unifiedfullviewingkey_get_unified_address_at: (a: number, b: number, c: number, d: number, e: number, f: number, g: bigint) => [number, number, number, number];
  readonly unifiedfullviewingkey_get_unified_address: (a: number, b: number, c: number) => [number, number, number, number];
  readonly generate_seed_phrase: () => [number, number];
  readonly pczt_sign: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly wasm_thread_entry_point: (a: number) => void;
  readonly __wbg_intounderlyingbytesource_free: (a: number, b: number) => void;
  readonly intounderlyingbytesource_type: (a: number) => number;
  readonly intounderlyingbytesource_autoAllocateChunkSize: (a: number) => number;
  readonly intounderlyingbytesource_start: (a: number, b: any) => void;
  readonly intounderlyingbytesource_pull: (a: number, b: any) => any;
  readonly intounderlyingbytesource_cancel: (a: number) => void;
  readonly __wbg_intounderlyingsource_free: (a: number, b: number) => void;
  readonly intounderlyingsource_pull: (a: number, b: any) => any;
  readonly intounderlyingsource_cancel: (a: number) => void;
  readonly __wbg_intounderlyingsink_free: (a: number, b: number) => void;
  readonly intounderlyingsink_write: (a: number, b: any) => any;
  readonly intounderlyingsink_close: (a: number) => any;
  readonly intounderlyingsink_abort: (a: number, b: any) => any;
  readonly __wbg_pczt_free: (a: number, b: number) => void;
  readonly pczt_to_json: (a: number) => any;
  readonly pczt_from_json: (a: any) => number;
  readonly pczt_serialize: (a: number) => [number, number];
  readonly pczt_from_bytes: (a: number, b: number) => number;
  readonly pczt_fee: (a: number) => bigint;
  readonly rustsecp256k1_v0_10_0_context_create: (a: number) => number;
  readonly rustsecp256k1_v0_10_0_context_destroy: (a: number) => void;
  readonly rustsecp256k1_v0_10_0_default_illegal_callback_fn: (a: number, b: number) => void;
  readonly rustsecp256k1_v0_10_0_default_error_callback_fn: (a: number, b: number) => void;
  readonly memory: WebAssembly.Memory;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_5: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_export_7: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly closure1521_externref_shim: (a: number, b: number, c: any) => void;
  readonly _dyn_core__ops__function__FnMut_____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__hd36cc01afe29005f: (a: number, b: number) => void;
  readonly closure1588_externref_shim: (a: number, b: number, c: any) => void;
  readonly closure3037_externref_shim: (a: number, b: number, c: any, d: any) => void;
  readonly __wbindgen_thread_destroy: (a?: number, b?: number, c?: number) => void;
  readonly __wbindgen_start: (a: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput, memory?: WebAssembly.Memory, thread_stack_size?: number }} module - Passing `SyncInitInput` directly is deprecated.
* @param {WebAssembly.Memory} memory - Deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput, memory?: WebAssembly.Memory, thread_stack_size?: number } | SyncInitInput, memory?: WebAssembly.Memory): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput>, memory?: WebAssembly.Memory, thread_stack_size?: number }} module_or_path - Passing `InitInput` directly is deprecated.
* @param {WebAssembly.Memory} memory - Deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput>, memory?: WebAssembly.Memory, thread_stack_size?: number } | InitInput | Promise<InitInput>, memory?: WebAssembly.Memory): Promise<InitOutput>;
