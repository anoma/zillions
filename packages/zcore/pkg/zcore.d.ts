/* tslint:disable */
/* eslint-disable */

/**
 * Trial-decrypt one pool's `/ciphertexts` chunk, the raw response body,
 * against `ufvk`. `chunk` is its number, which fixes each note's position.
 *
 * Returns the hits: `[{ pool, scope, value, nf_mine, index }]`.
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
