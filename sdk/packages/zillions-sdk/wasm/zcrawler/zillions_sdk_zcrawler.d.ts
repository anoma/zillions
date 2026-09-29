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

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly try_decrypt: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number];
  readonly try_decrypt_full: (a: number, b: number, c: number, d: number, e: number, f: number, g: any) => [number, number, number];
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
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
