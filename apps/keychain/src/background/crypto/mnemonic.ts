import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

export { wordlist };

/** BIP-39 phrase sizes the UI offers. */
export type PhraseSize = 12 | 24;

export const generateMnemonic = async (
  size: PhraseSize = 12,
): Promise<string[]> =>
  bip39.generateMnemonic(wordlist, size === 12 ? 128 : 256).split(" ");

/** Checksum + English wordlist; words must be lowercase and single-spaced. */
export const validateMnemonic = async (phrase: string): Promise<boolean> =>
  bip39.validateMnemonic(phrase, wordlist);

/** Throws on an invalid phrase rather than deriving a seed from it. */
export const mnemonicToSeed = async (
  phrase: string,
  passphrase?: string,
): Promise<Uint8Array> => {
  if (!bip39.validateMnemonic(phrase, wordlist)) {
    throw new Error("Invalid phrase");
  }
  return bip39.mnemonicToSeed(phrase, passphrase);
};
