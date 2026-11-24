/**
 * The passkey seed math, pure and zero-import: BIP-39's seed from the
 * entropy, without the phrase. The mnemonic encoding is deterministic
 * bit-packing (11-bit wordlist indices over a SHA-256 checksum), so the
 * phrase is packed straight to its bytes — no string of it ever exists —
 * and the KDF is WebCrypto's audited PBKDF2-HMAC-SHA-512. Phrase wallets
 * seed through `mnemonicToSeed` in `background/crypto/mnemonic.ts`; this is
 * the passkey runtime's only seed authority.
 */
import { wordlist } from "@scure/bip39/wordlists/english.js";

/** The salt BIP-39 fixes: `"mnemonic"`, plus the (here, absent) passphrase. */
const MNEMONIC_SALT = new TextEncoder().encode("mnemonic");

/**
 * The BIP-39 phrase `entropy` encodes, as its own ASCII bytes. The words
 * come from the public wordlist table; only their join is secret, and only
 * its bytes exist — never a string.
 */
export const packPhraseBytes = async (
  entropy: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> => {
  const entBits = entropy.length * 8;
  // BIP-39 allows 128 to 256 bits, in steps of 32 (12 to 24 words).
  if (entropy.length < 16 || entropy.length > 32 || entBits % 32 !== 0) {
    throw new Error("The entropy's length is not one BIP-39 allows");
  }
  const checksum = new Uint8Array(
    await crypto.subtle.digest("SHA-256", entropy)
  );
  // Bit `i` of entropy||checksum, most significant bit first.
  const bit = (i: number): number => {
    const byte = i < entBits ? entropy[i >> 3] : checksum[(i - entBits) >> 3];
    return (byte >> (7 - (i & 7))) & 1;
  };
  const words: string[] = [];
  for (let i = 0; i < entBits + entBits / 32; i += 11) {
    let index = 0;
    for (let j = 0; j < 11; j++) index = (index << 1) | bit(i + j);
    words.push(wordlist[index]);
  }
  // Pack the words' chars straight into bytes, space-joined: the wordlist
  // is pure ASCII, and building the joined string is the leak this exists
  // to avoid.
  const bytes = new Uint8Array(
    words.reduce((n, w) => n + w.length, 0) + words.length - 1
  );
  let at = 0;
  words.forEach((w, i) => {
    if (i > 0) bytes[at++] = 32;
    for (let j = 0; j < w.length; j++) bytes[at++] = w.charCodeAt(j);
  });
  return bytes;
};

/**
 * The BIP-39 seed for `entropy` (the credential's PRF output): the phrase
 * bytes through PBKDF2-HMAC-SHA-512, 2048 iterations, salt `"mnemonic"`
 * (the spec's, with no passphrase). `passphrase` exists for the official
 * test vectors; the passkey runtime never passes one. The phrase bytes
 * are zero-filled on every exit; the returned seed is the caller's to
 * zero (`withPrfSeed` in `passkey-core.ts` does).
 */
export const deriveSeed = async (
  entropy: Uint8Array<ArrayBuffer>,
  passphrase = ""
): Promise<Uint8Array<ArrayBuffer>> => {
  const phraseBytes = await packPhraseBytes(entropy);
  try {
    // NB: importKey copies the phrase bytes into a non-extractable
    // CryptoKey the browser owns, which waits for GC — the price of the
    // audited primitive (a hand-rolled PBKDF2 was considered and
    // rejected). No string of the phrase exists anywhere.
    const key = await crypto.subtle.importKey(
      "raw",
      phraseBytes,
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const salt = passphrase
      ? new TextEncoder().encode(`mnemonic${passphrase}`)
      : MNEMONIC_SALT;
    return new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-512", salt, iterations: 2048 },
        key,
        512
      )
    );
  } finally {
    phraseBytes.fill(0);
  }
};
