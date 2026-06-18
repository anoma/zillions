/* tslint:disable */
/* eslint-disable */
export enum ByteSize {
  N12 = 12,
  N24 = 24,
  N32 = 32,
}
export class AES {
  free(): void;
  constructor(key: VecU8Pointer, iv: Uint8Array);
  encrypt(text: string): Uint8Array;
  decrypt(ciphertext: Uint8Array): VecU8Pointer;
}
export class Argon2 {
  free(): void;
  constructor(password: string, salt?: string | null, params?: Argon2Params | null);
  to_hash(): string;
  verify(hash: string): void;
  params(): Argon2Params;
  /**
   * Convert PHC string to serialized key
   */
  key(): VecU8Pointer;
}
export class Argon2Params {
  free(): void;
  constructor(m_cost: number, t_cost: number, p_cost: number);
  readonly m_cost: number;
  readonly t_cost: number;
  readonly p_cost: number;
}
export class DerivationResult {
  private constructor();
  free(): void;
  xsk(): Uint8Array;
  xfvk(): Uint8Array;
  payment_address(): Uint8Array;
}
export class HDWallet {
  free(): void;
  constructor(seed_ptr: VecU8Pointer);
  static from_seed(seed: Uint8Array): HDWallet;
  /**
   * Derive account from a seed and a path
   */
  derive(path: Uint32Array): Key;
  static disposable_keypair(): Key;
}
export class Key {
  free(): void;
  constructor(bytes: Uint8Array);
  to_bytes(): Uint8Array;
  to_hex(): StringPointer;
}
export class Mnemonic {
  free(): void;
  constructor(size: number);
  static validate(phrase: string): boolean;
  static from_phrase(phrase: string): Mnemonic;
  to_seed(passphrase?: StringPointer | null): VecU8Pointer;
  to_words(): VecStringPointer;
  phrase(): string;
}
export class Rng {
  private constructor();
  free(): void;
  static generate_bytes(size?: ByteSize | null): Uint8Array;
}
export class Salt {
  free(): void;
  constructor(salt: string);
  static generate(): Salt;
  to_bytes(): Uint8Array;
  as_string(): string;
}
export class ShieldedHDWallet {
  free(): void;
  constructor(seed: any, path: Uint32Array);
  static new_from_sk(sk_bytes: Uint8Array): ShieldedHDWallet;
  derive(path: Uint32Array, diversifier?: Uint8Array | null): DerivationResult;
}
export class StringPointer {
  free(): void;
  constructor(string: string);
  pointer: number;
  length: number;
}
export class VecStringPointer {
  private constructor();
  free(): void;
  readonly pointers: Uint32Array;
  readonly lengths: Uint32Array;
}
export class VecU8Pointer {
  free(): void;
  constructor(vec: Uint8Array);
  pointer: number;
  length: number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_key_free: (a: number, b: number) => void;
  readonly key_new: (a: number, b: number) => [number, number, number];
  readonly key_to_bytes: (a: number) => [number, number];
  readonly key_to_hex: (a: number) => number;
  readonly __wbg_hdwallet_free: (a: number, b: number) => void;
  readonly hdwallet_new: (a: number) => [number, number, number];
  readonly hdwallet_from_seed: (a: number, b: number) => [number, number, number];
  readonly hdwallet_derive: (a: number, b: number, c: number) => [number, number, number];
  readonly hdwallet_disposable_keypair: () => [number, number, number];
  readonly __wbg_rng_free: (a: number, b: number) => void;
  readonly rng_generate_bytes: (a: number) => [number, number, number, number];
  readonly __wbg_salt_free: (a: number, b: number) => void;
  readonly salt_new: (a: number, b: number) => [number, number, number];
  readonly salt_generate: () => number;
  readonly salt_to_bytes: (a: number) => [number, number, number, number];
  readonly salt_as_string: (a: number) => [number, number];
  readonly __wbg_derivationresult_free: (a: number, b: number) => void;
  readonly derivationresult_xsk: (a: number) => [number, number];
  readonly derivationresult_xfvk: (a: number) => [number, number];
  readonly derivationresult_payment_address: (a: number) => [number, number];
  readonly __wbg_shieldedhdwallet_free: (a: number, b: number) => void;
  readonly shieldedhdwallet_new: (a: any, b: number, c: number) => [number, number, number];
  readonly shieldedhdwallet_new_from_sk: (a: number, b: number) => [number, number, number];
  readonly shieldedhdwallet_derive: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
  readonly __wbg_vecu8pointer_free: (a: number, b: number) => void;
  readonly __wbg_stringpointer_free: (a: number, b: number) => void;
  readonly __wbg_get_stringpointer_pointer: (a: number) => number;
  readonly __wbg_set_stringpointer_pointer: (a: number, b: number) => void;
  readonly __wbg_get_stringpointer_length: (a: number) => number;
  readonly __wbg_set_stringpointer_length: (a: number, b: number) => void;
  readonly stringpointer_new: (a: number, b: number) => number;
  readonly __wbg_vecstringpointer_free: (a: number, b: number) => void;
  readonly vecstringpointer_pointers: (a: number) => [number, number];
  readonly vecstringpointer_lengths: (a: number) => [number, number];
  readonly vecu8pointer_new: (a: number, b: number) => number;
  readonly __wbg_get_vecu8pointer_length: (a: number) => number;
  readonly __wbg_set_vecu8pointer_pointer: (a: number, b: number) => void;
  readonly __wbg_get_vecu8pointer_pointer: (a: number) => number;
  readonly __wbg_set_vecu8pointer_length: (a: number, b: number) => void;
  readonly __wbg_argon2params_free: (a: number, b: number) => void;
  readonly argon2params_new: (a: number, b: number, c: number) => number;
  readonly argon2params_m_cost: (a: number) => number;
  readonly argon2params_t_cost: (a: number) => number;
  readonly argon2params_p_cost: (a: number) => number;
  readonly __wbg_argon2_free: (a: number, b: number) => void;
  readonly argon2_new: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
  readonly argon2_to_hash: (a: number) => [number, number, number, number];
  readonly argon2_verify: (a: number, b: number, c: number) => [number, number];
  readonly argon2_params: (a: number) => number;
  readonly argon2_key: (a: number) => [number, number, number];
  readonly __wbg_aes_free: (a: number, b: number) => void;
  readonly aes_new: (a: number, b: number, c: number) => [number, number, number];
  readonly aes_encrypt: (a: number, b: number, c: number) => [number, number, number, number];
  readonly aes_decrypt: (a: number, b: number, c: number) => [number, number, number];
  readonly __wbg_mnemonic_free: (a: number, b: number) => void;
  readonly mnemonic_new: (a: number) => [number, number, number];
  readonly mnemonic_validate: (a: number, b: number) => number;
  readonly mnemonic_from_phrase: (a: number, b: number) => [number, number, number];
  readonly mnemonic_to_seed: (a: number, b: number) => [number, number, number];
  readonly mnemonic_to_words: (a: number) => [number, number, number];
  readonly mnemonic_phrase: (a: number) => [number, number];
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_2: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
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
export default function __wbg_init (module_or_path: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
