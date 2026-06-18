import init, {
  AES,
  Argon2,
  Argon2Params as Argon2ParamsWasm,
  ByteSize,
  Mnemonic,
  Rng,
  Salt,
  StringPointer,
  VecU8Pointer,
} from "@zillions/crypto";
// The wasm binary is resolved to a URL at build time (Vite `?url`) and copied
// into the extension bundle (see vite.config.mts static-copy target).
import cryptoWasmUrl from "@zillions/crypto/src/crypto/crypto_bg.wasm?url";

import { Argon2Config, CryptoRecord, KdfType } from "./types";

export type { CryptoRecord } from "./types";
export { KdfType } from "./types";

let cryptoMemory: WebAssembly.Memory | undefined;
let initialized: Promise<void> | undefined;

/**
 * Initialize the `@zillions/crypto` wasm module. Idempotent.
 * Must be awaited before any other crypto/mnemonic function is used.
 */
export const initCrypto = async (): Promise<void> => {
  if (!initialized) {
    initialized = (async () => {
      const output = await init(cryptoWasmUrl);
      cryptoMemory = output.memory;
    })();
  }
  return initialized;
};

const getMemory = (): WebAssembly.Memory => {
  if (!cryptoMemory) {
    throw new Error("@zillions/crypto wasm not initialized; call initCrypto()");
  }
  return cryptoMemory;
};

/**
 * Read the bytes referenced by a `VecU8Pointer` out of the wasm linear memory.
 */
const readVecU8Pointer = (vec: VecU8Pointer): Uint8Array => {
  const buffer = new Uint8Array(getMemory().buffer);
  // Copy out of the (potentially detached/resized) wasm memory.
  return buffer.slice(vec.pointer, vec.pointer + vec.length);
};

const makeCryptoRecord = (
  cipherText: Uint8Array,
  params: { m_cost: number; t_cost: number; p_cost: number },
  iv: Uint8Array,
  salt: string
): CryptoRecord => {
  const { m_cost, t_cost, p_cost } = params;
  return {
    cipher: {
      type: "aes-256-gcm",
      iv,
      text: cipherText,
    },
    kdf: {
      type: KdfType.Argon2,
      params: {
        m_cost,
        t_cost,
        p_cost,
        salt,
      },
    },
  };
};

/**
 * Crypto handles AES-256-GCM encryption with an Argon2id-derived key,
 * producing/consuming the same `CryptoRecord` shape the vault schema expects.
 */
export class Crypto {
  /**
   * Encrypt a string using AES-256-GCM with an Argon2id-derived key.
   */
  public encrypt(plainText: string, password: string): CryptoRecord {
    const saltInstance = Salt.generate();
    const salt = saltInstance.as_string();
    saltInstance.free();

    const { m_cost, t_cost, p_cost } = Argon2Config;
    const argon2Params = new Argon2ParamsWasm(m_cost, t_cost, p_cost);
    const argon2 = new Argon2(password, salt, argon2Params);
    const paramsWasm = argon2.params();
    const params = {
      m_cost: paramsWasm.m_cost,
      t_cost: paramsWasm.t_cost,
      p_cost: paramsWasm.p_cost,
    };
    paramsWasm.free();
    const key = argon2.key();
    argon2.free();

    const iv = Rng.generate_bytes(ByteSize.N12);

    // `new AES(key, iv)` TAKES OWNERSHIP of `key` (the wasm-bindgen glue calls
    // `key.__destroy_into_raw()`, zeroing its pointer). Do NOT free `key`
    // afterwards — that would be a double-free and the wasm aborts with
    // "null pointer passed to rust".
    const aes = new AES(key, iv);
    const cipherText = aes.encrypt(plainText);
    aes.free();

    return makeCryptoRecord(cipherText, params, iv, salt);
  }

  /**
   * Decrypt a `CryptoRecord` using the provided password.
   */
  public decrypt(cryptoRecord: CryptoRecord, password: string): string {
    const { cipher, kdf } = cryptoRecord;
    const { m_cost, p_cost, t_cost, salt } = kdf.params;

    const argon2Params = new Argon2ParamsWasm(m_cost, t_cost, p_cost);
    const argon2 = new Argon2(password, salt, argon2Params);
    const key = argon2.key();
    argon2.free();

    // `new AES(key, ...)` takes ownership of `key` (see `encrypt`); freeing it
    // here would double-free and abort the wasm ("null pointer passed to rust").
    const aes = new AES(key, cipher.iv);
    const vecU8Pointer = aes.decrypt(cipher.text);
    const decrypted = readVecU8Pointer(vecU8Pointer);
    const plainText = new TextDecoder().decode(decrypted);
    aes.free();
    vecU8Pointer.free();

    return plainText;
  }
}

export enum PhraseSize {
  N12 = 12,
  N24 = 24,
}

/** Mnemonic helpers backed by `@zillions/crypto` (generate / validate / toSeed). */
export class MnemonicService {
  /**
   * Generate a fresh BIP39 mnemonic and return it as an array of words.
   */
  public generate(size: PhraseSize = PhraseSize.N12): string[] {
    const mnemonic = new Mnemonic(size);
    const phrase = mnemonic.phrase();
    mnemonic.free();
    return phrase.split(" ");
  }

  /**
   * Validate a BIP39 mnemonic phrase.
   */
  public validate(phrase: string): boolean {
    return Mnemonic.validate(phrase);
  }

  /**
   * Convert a mnemonic phrase (+ optional passphrase) into a seed.
   */
  public toSeed(phrase: string, passphrase?: string): Uint8Array {
    const mnemonic = Mnemonic.from_phrase(phrase);
    const ptr =
      passphrase && passphrase.length > 0
        ? mnemonic.to_seed(makeStringPointer(passphrase))
        : mnemonic.to_seed();
    const seed = readVecU8Pointer(ptr);
    ptr.free();
    mnemonic.free();
    return seed;
  }
}

// `Mnemonic.to_seed` accepts a `StringPointer | null`.
const makeStringPointer = (s: string): StringPointer => new StringPointer(s);
