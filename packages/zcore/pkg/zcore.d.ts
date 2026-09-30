/* tslint:disable */
/* eslint-disable */

/**
 * The account at ZIP-32 index `hd_index`: `{ ufvk, transparent, unified }`.
 */
export function derive_account(network: string, seed: Uint8Array, hd_index: number): any;

/**
 * Transparent addresses `from..from + count` on one BIP-44 chain of the
 * viewing key's account: `"external"` (receiving) or `"internal"` (change).
 * Empty when the viewing key has no transparent part.
 */
export function derive_transparent(network: string, ufvk: string, scope: string, from: number, count: number): string[];

/**
 * A new shielded address of the account `ufvk` names, unlinkable to its
 * others; nothing needs to remember it, the viewing key finds what it receives.
 */
export function fresh_address(network: string, ufvk: string): string;

/**
 * The most `send` (its `amount` ignored) can pay after fees, in zatoshis.
 */
export function max_send(network: string, wallet: any, send: any): bigint;

/**
 * Whether proving `pczt` needs the Sapling parameters (~51 MB to fetch).
 */
export function needs_sapling_params(pczt: Uint8Array): boolean;

/**
 * The transparent side of a raw transaction mined at `height`, which fixes
 * the consensus rules it is read under: `{ txid, inputs: [{ txid, index }],
 * outputs: [{ index, value, address }] }`.
 */
export function parse_transaction(network: string, height: number, data: Uint8Array): any;

/**
 * What a PCZT moves: `{ network, transparentInputs, transparentOutputs,
 * orchardOutputs, fee }`, values in zatoshis as strings.
 */
export function pczt_summary(network: string, pczt: Uint8Array): any;

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
 * The seed's ZIP-32 fingerprint, hex. Names the seed without revealing it.
 */
export function seed_fingerprint(seed: Uint8Array): string;

/**
 * The unsigned PCZT for `send`, planned as [`plan_send`] plans it, for the
 * seed account (`seed_fingerprint`, `hd_index`) behind `ufvk`. `trees` maps
 * each pool spent from to `{ tip, chunks: { [chunk]: body } }`: ziziphus's
 * raw tip snapshot and the frozen chunks holding the notes `plan_send` named.
 */
export function send_pczt(network: string, ufvk: string, seed_fingerprint: string, hd_index: number, wallet: any, send: any, trees: any): Uint8Array;

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
 * Trial-decrypt one pool's full notes against `ufvk`.
 *
 * `notes` is the `/notes/full` payload: an array of that pool's notes, whole
 * ciphertexts included. Returns
 * `{ hits: [{ pool, scope, value, nf_mine, memo, recipient, height, tx_index, position }],
 *    sent: [{ pool, value, recipient, memo, height, tx_index, position }] }`.
 *
 * `sent` stays empty unless the payload carries `cv` and `out_ciphertext`:
 * recovering an output we created needs both.
 *
 * Worth fetching only for a chunk a compact pass already found a note in — a
 * full chunk is ~50× a compact one.
 */
export function try_decrypt_full(network: string, ufvk: string, pool: string, notes: any): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly derive_account: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly derive_transparent: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly fresh_address: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly max_send: (a: number, b: number, c: any, d: any) => [bigint, number, number];
    readonly needs_sapling_params: (a: number, b: number) => [number, number, number];
    readonly parse_transaction: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly pczt_summary: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly plan_send: (a: number, b: number, c: any, d: any) => [number, number, number];
    readonly plan_shield: (a: number, b: number, c: any) => [number, number, number];
    readonly prove_pczt: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly seed_fingerprint: (a: number, b: number) => [number, number, number, number];
    readonly send_pczt: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: any, i: any, j: any) => [number, number, number, number];
    readonly shield_pczt: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: any, i: any) => [number, number, number, number];
    readonly sign_pczt: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly spending_keys: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly try_decrypt: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number];
    readonly try_decrypt_full: (a: number, b: number, c: number, d: number, e: number, f: number, g: any) => [number, number, number];
    readonly rustsecp256k1_v0_10_0_default_error_callback_fn: (a: number, b: number) => void;
    readonly rustsecp256k1_v0_10_0_default_illegal_callback_fn: (a: number, b: number) => void;
    readonly rustsecp256k1_v0_10_0_context_destroy: (a: number) => void;
    readonly rustsecp256k1_v0_10_0_context_create: (a: number) => number;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
