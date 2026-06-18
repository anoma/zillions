/* tslint:disable */
/* eslint-disable */
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
export class Pczt {
  private constructor();
  free(): void;
  /**
   * Returns a JSON object with the details of the Pczt.
   */
  to_json(): any;
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
   * The transparent external receive PUBLIC KEY (secp256k1, compressed, hex)
   * at BIP-44 `m/44'/<coin_type>'/<account>'/0/0` — the public key whose
   * address is `get_external_transparent_address`. `None` if this UFVK has
   * no transparent component.
   *
   * This is the account's actual transparent public key. It is DISTINCT from
   * the UFVK encoding (`encode`), which is a VIEWING key (it lets the holder
   * see shielded activity) — not a public key. Fully OFFLINE: pure key math.
   */
  get_external_transparent_pubkey(): string | undefined;
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
   * Get the standard external transparent receive address — BIP-44
   * `m/44'/<coin_type>'/<account>'/0/0` — for this UFVK's transparent
   * component.
   *
   * Unlike `get_transparent_address`, which returns the transparent receiver
   * embedded in the *default unified address* (at the UA's pseudo-random
   * diversifier index), this returns the conventional index-0 receive
   * address that other wallets (e.g. the Zcash mobile SDK) display. Fully
   * OFFLINE: pure key math, no network.
   *
   * # Arguments
   *
   * * `network` - Must be either "main" or "test"
   */
  get_external_transparent_address(network: string): string | undefined;
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
   * Verify a Bitcoin/Zcash signed-message signature produced by
   * `sign_arbitrary`. Associated function (no `self`) — wasm-bindgen exports
   * it as the static method `UnifiedSpendingKey.verify_arbitrary`.
   *
   * Recovers the signing public key from the recoverable signature + 32-byte
   * digest and checks it matches `public_key_hex` (compressed secp256k1, 33
   * bytes hex). Returns `Ok(true)` only when the signature is valid AND its
   * recovered key equals the expected one. Pure public-key crypto — no
   * secret material.
   *
   * * `public_key_hex`   — expected compressed secp256k1 public key, hex
   * * `hash_hex`         — the 32-byte double-SHA256 digest, hex
   * * `signature_base64` — the 65-byte `[header || r || s]`, base64
   */
  static verify_arbitrary(public_key_hex: string, hash_hex: string, signature_base64: string): boolean;
  /**
   * Sign an arbitrary UTF-8 message with this account's transparent
   * secp256k1 key — the external receive key at index 0, i.e. the same key
   * behind `get_external_transparent_address`.
   *
   * Uses the Bitcoin/Zcash "signed message" construction so the result is
   * interoperable with `zcashd verifymessage`: the message is serialized as
   * `compactsize(magic)||magic||compactsize(msg)||msg` (magic =
   * "Zcash Signed Message:\n"), double-SHA256 hashed, then signed with a
   * RECOVERABLE ECDSA signature (RFC6979 deterministic nonce).
   *
   * Returns `"<hash_hex>:<sig_base64>:<pubkey_hex>"`:
   *   - `hash_hex`   — the 32-byte double-SHA256 digest, hex
   *   - `sig_base64` — the 65-byte Bitcoin-style `[header || r || s]`,
   *                    header = `27 + recid + 4` (the +4 = compressed key),
   *                    base64-encoded (the encoding zcashd emits)
   *   - `pubkey_hex` — the compressed secp256k1 public key (33 bytes), hex
   *
   * SECURITY: requires the spending key. Fully OFFLINE — pure key math.
   */
  sign_arbitrary(message: string): string;
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

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly __wbg_seedfingerprint_free: (a: number, b: number) => void;
  readonly seedfingerprint_new: (a: number, b: number) => [number, number, number];
  readonly seedfingerprint_to_bytes: (a: number) => [number, number];
  readonly seedfingerprint_from_bytes: (a: number, b: number) => [number, number, number];
  readonly __wbg_proofgenerationkey_free: (a: number, b: number) => void;
  readonly __wbg_unifiedspendingkey_free: (a: number, b: number) => void;
  readonly unifiedspendingkey_new: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
  readonly unifiedspendingkey_verify_arbitrary: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
  readonly unifiedspendingkey_sign_arbitrary: (a: number, b: number, c: number) => [number, number, number, number];
  readonly unifiedspendingkey_sapling_extended_spending_key: (a: number, b: number, c: number) => [number, number, number, number];
  readonly unifiedspendingkey_to_bytes_hex: (a: number) => [number, number];
  readonly unifiedspendingkey_from_seed_phrase: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
  readonly unifiedspendingkey_to_unified_full_viewing_key: (a: number) => number;
  readonly unifiedspendingkey_to_sapling_proof_generation_key: (a: number) => number;
  readonly __wbg_unifiedfullviewingkey_free: (a: number, b: number) => void;
  readonly unifiedfullviewingkey_encode: (a: number, b: number, c: number) => [number, number, number, number];
  readonly unifiedfullviewingkey_new: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly unifiedfullviewingkey_get_transparent_address: (a: number, b: number, c: number) => [number, number, number, number];
  readonly unifiedfullviewingkey_get_external_transparent_pubkey: (a: number) => [number, number, number, number];
  readonly unifiedfullviewingkey_ua_diversifier_index: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
  readonly unifiedfullviewingkey_get_unified_address_at: (a: number, b: number, c: number, d: number, e: number, f: number, g: bigint) => [number, number, number, number];
  readonly unifiedfullviewingkey_get_external_transparent_address: (a: number, b: number, c: number) => [number, number, number, number];
  readonly unifiedfullviewingkey_get_unified_address: (a: number, b: number, c: number) => [number, number, number, number];
  readonly generate_seed_phrase: () => [number, number];
  readonly pczt_sign: (a: number, b: number, c: number, d: number, e: number) => any;
  readonly __wbg_pczt_free: (a: number, b: number) => void;
  readonly pczt_to_json: (a: number) => any;
  readonly pczt_from_json: (a: any) => number;
  readonly pczt_serialize: (a: number) => [number, number];
  readonly pczt_from_bytes: (a: number, b: number) => number;
  readonly rustsecp256k1_v0_10_0_context_create: (a: number) => number;
  readonly rustsecp256k1_v0_10_0_context_destroy: (a: number) => void;
  readonly rustsecp256k1_v0_10_0_default_illegal_callback_fn: (a: number, b: number) => void;
  readonly rustsecp256k1_v0_10_0_default_error_callback_fn: (a: number, b: number) => void;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_2: WebAssembly.Table;
  readonly memory: WebAssembly.Memory;
  readonly __wbindgen_export_4: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly closure62_externref_shim: (a: number, b: number, c: any) => void;
  readonly closure285_externref_shim: (a: number, b: number, c: any, d: any) => void;
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
