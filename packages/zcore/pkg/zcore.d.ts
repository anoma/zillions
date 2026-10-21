/* tslint:disable */
/* eslint-disable */

/**
 * Where a payment to `address` lands: `"shielded"` when it has a shielded
 * receiver, else `"transparent"` (TEX addresses too). `undefined` when it
 * isn't a valid address on `network`.
 */
export function address_kind(network: string, address: string): string | undefined;

/**
 * Combine the two given PCZTs.
 */
export function combine_pczts(pczt0: Uint8Array, pczt1: Uint8Array): Uint8Array;

/**
 * The account at ZIP-32 index `hd_index`: `{ ufvk, transparent, unified }`.
 */
export function derive_account(network: string, seed: Uint8Array, hd_index: number): any;

/**
 * The account at unified full viewing key `ufvk`: `{ ufvk, transparent, unified }`.
 */
export function derive_account_from_ufvk(network: string, ufvk: string): any;

/**
 * Transparent addresses `from..from + count` on one BIP-44 chain of the
 * viewing key's account: `"external"` (receiving) or `"internal"` (change).
 * Empty when the viewing key has no transparent part.
 */
export function derive_transparent(network: string, ufvk: string, scope: string, from: number, count: number): string[];

/**
 * The records of an Orchard or Ironwood `/ciphertexts` chunk that spend one
 * of `nullifiers` (each 32 bytes, concatenated), by index in the chunk.
 */
export function find_spends(pool: string, ciphertexts: Uint8Array, nullifiers: Uint8Array): Uint32Array;

/**
 * A new shielded address of the account `ufvk` names, unlinkable to its
 * others; nothing needs to remember it, the viewing key finds what it receives.
 */
export function fresh_address(network: string, ufvk: string): string;

/**
 * Unused addresses in a row that end each chain when scanning:
 * `{ external, internal }`, upstream's defaults, so other wallets restoring
 * the phrase find every address this one hands out.
 */
export function gap_limits(): any;

/**
 * The most `send` (its `amount` ignored) can pay after fees, in zatoshis.
 */
export function max_send(network: string, wallet: any, send: any): bigint;

/**
 * Whether proving `pczt` needs the Sapling parameters (~51 MB to fetch).
 */
export function needs_sapling_params(pczt: Uint8Array): boolean;

/**
 * Which of `nullifiers` (each 32 bytes, concatenated) a `/nullifiers` chunk
 * holds, matched on the 10 bytes it serves. Returns `{ spent, frozen }`:
 * `spent` indexes into `nullifiers`; a chunk that isn't `frozen` is the tail.
 */
export function nullifiers_spent(body: Uint8Array, nullifiers: Uint8Array): any;

/**
 * The transparent side of a raw transaction mined at `height`, which fixes
 * the consensus rules it is read under, and the nullifiers it spends:
 * `{ txid, inputs: [{ txid, index }], outputs: [{ index, value, address }],
 * nullifiers }`.
 */
export function parse_transaction(network: string, height: number, data: Uint8Array): any;

/**
 * What a PCZT moves: `{ network, fee }` and inputs and outputs per pool
 * (`transparent`, `sapling`, `orchard`, `ironwood`), values in zatoshis as
 * strings. Each output says whether it's `mine`, by the signing account's
 * `ufvk`; throws if an output's note or label doesn't match what's signed.
 */
export function pczt_summary(network: string, pczt: Uint8Array, ufvk: string): any;

/**
 * The plan for moving every spendable Orchard note to Ironwood with
 * privacy, as of `wallet`'s tip; each call draws a new order and timing.
 */
export function plan_migration(network: string, wallet: any): any;

/**
 * Plans a send: `wallet` is `{ tip, notes, utxos }` (unspent only), `send`
 * is `{ to, amount, memo?, from }`. Returns `{ steps: [{ inputs, payments,
 * change, fee }], fee }`, values in zatoshis.
 */
export function plan_send(network: string, wallet: any, send: any): any;

/**
 * Plans shielding every transparent coin: the same summary as [`plan_send`],
 * with the shielded value as change.
 */
export function plan_shield(network: string, wallet: any): any;

/**
 * Proves a signed PCZT and extracts its transaction: `{ txid, raw, expiry_height }`. The
 * Sapling parameters are needed only when [`needs_sapling_params`] says so.
 * Building the Halo2 proving key alone takes seconds; run it off the UI thread.
 */
export function prove_pczt(pczt: Uint8Array, sapling_spend?: Uint8Array | null, sapling_output?: Uint8Array | null): any;

/**
 * The address a transparent output's `script` pays; `undefined` unless it's
 * P2PKH or P2SH.
 */
export function script_address(network: string, script: Uint8Array): string | undefined;

/**
 * The seed's ZIP-32 fingerprint, hex. Names the seed without revealing it.
 */
export function seed_fingerprint(seed: Uint8Array): string;

/**
 * The unsigned PCZT for `send`, planned as [`plan_send`] plans it, for the
 * seed account (`seed_fingerprint`, `hd_index`) behind `ufvk`. `trees` maps
 * each pool spent from to `{ tip, chunks: { [chunk]: body } }`: ziziphus's
 * raw tip snapshot and the frozen chunks holding the notes `plan_send` named.
 * A plan with transparent change sends it to internal address `change_index`,
 * which the caller keeps unused.
 */
export function send_pczt(network: string, ufvk: string, seed_fingerprint: string, hd_index: number, wallet: any, send: any, trees: any, change_index?: number | null): Uint8Array;

/**
 * The unsigned PCZT shielding every transparent coin, planned as
 * [`plan_shield`] plans it; `trees` as for [`send_pczt`].
 */
export function shield_pczt(network: string, ufvk: string, seed_fingerprint: string, hd_index: number, wallet: any, trees: any): Uint8Array;

/**
 * The PCZT with every input the seed's account `hd_index` holds signed.
 */
export function sign_pczt(network: string, pczt: Uint8Array, seed: Uint8Array, hd_index: number): Uint8Array;

/**
 * The account's spending secret in both encodings: `{ orchard, sapling }`.
 */
export function spending_keys(network: string, seed: Uint8Array, hd_index: number): any;

/**
 * Trial-decrypt one pool's `/ciphertexts` chunk, the raw response body,
 * against `ufvk`. `chunk` is its number, which fixes each note's position.
 *
 * Returns `{ count, min_height, hits: [{ pool, scope, value, nf_mine, index }] }`.
 */
export function try_decrypt(network: string, ufvk: string, pool: string, chunk: number, body: Uint8Array): any;

/**
 * Trial-decrypt one pool's chunk in full against `ufvk`: the raw
 * `/ciphertexts`, `/memos` and `/outgoing` bodies for chunk number `chunk`,
 * the `index` of each hit [`try_decrypt`] found in it, and of each spend
 * [`spends::find_spends`] found. Returns
 * `{ hits: [{ pool, scope, value, nf_mine, memo, recipient, height, tx_index, position }],
 *    sent: [{ pool, value, recipient, memo, height, tx_index, position }],
 *    spends: [{ nf, height, tx_index }] }`.
 */
export function try_decrypt_full(network: string, ufvk: string, pool: string, chunk: number, ciphertexts: Uint8Array, memos: Uint8Array, outgoing: Uint8Array, hits: Uint32Array, spends: Uint32Array): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly address_kind: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly combine_pczts: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly derive_account: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly derive_account_from_ufvk: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly derive_transparent: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly find_spends: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly fresh_address: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly gap_limits: () => [number, number, number];
    readonly max_send: (a: number, b: number, c: any, d: any) => [bigint, number, number];
    readonly needs_sapling_params: (a: number, b: number) => [number, number, number];
    readonly nullifiers_spent: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly parse_transaction: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly pczt_summary: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly plan_migration: (a: number, b: number, c: any) => [number, number, number];
    readonly plan_send: (a: number, b: number, c: any, d: any) => [number, number, number];
    readonly plan_shield: (a: number, b: number, c: any) => [number, number, number];
    readonly prove_pczt: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly script_address: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly seed_fingerprint: (a: number, b: number) => [number, number, number, number];
    readonly send_pczt: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: any, i: any, j: any, k: number) => [number, number, number, number];
    readonly shield_pczt: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: any, i: any) => [number, number, number, number];
    readonly sign_pczt: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly spending_keys: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly try_decrypt: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number];
    readonly try_decrypt_full: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number) => [number, number, number];
    readonly rustsecp256k1_v0_10_0_context_create: (a: number) => number;
    readonly rustsecp256k1_v0_10_0_context_destroy: (a: number) => void;
    readonly rustsecp256k1_v0_10_0_default_error_callback_fn: (a: number, b: number) => void;
    readonly rustsecp256k1_v0_10_0_default_illegal_callback_fn: (a: number, b: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
