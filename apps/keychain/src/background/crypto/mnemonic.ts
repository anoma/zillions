/**
 * BIP-39 mnemonic generation/validation, backed by the `@zillions/crypto` WASM
 * module. Thin async wrappers over `MnemonicService` that guarantee wasm init.
 */
import { initCrypto, MnemonicService, PhraseSize as Size } from "./crypto";

/** BIP-39 phrase sizes the UI offers. */
export type PhraseSize = 12 | 24;

const service = new MnemonicService();

/**
 * Generate a fresh BIP-39 mnemonic as an array of words.
 */
export const generateMnemonic = async (
  size: PhraseSize = 12
): Promise<string[]> => {
  await initCrypto();
  return service.generate(size === 12 ? Size.N12 : Size.N24);
};

/**
 * Validate a BIP-39 mnemonic phrase (checksum + wordlist).
 */
export const validateMnemonic = async (phrase: string): Promise<boolean> => {
  await initCrypto();
  return service.validate(phrase);
};

/**
 * Derive the BIP-39 seed bytes for a phrase (+ optional passphrase). Feeds the
 * PCZT signer's UnifiedSpendingKey/SeedFingerprint reconstruction.
 */
export const mnemonicToSeed = async (
  phrase: string,
  passphrase?: string
): Promise<Uint8Array> => {
  await initCrypto();
  return service.toSeed(phrase, passphrase);
};
