/**
 * The passkey seed math, pinned. `packPhraseBytes` + `deriveSeed` replace
 * the wasm phrase path byte-for-byte: any silent drift turns every
 * passkey account into a different wallet — so the official BIP-39
 * vectors, the `@scure` string path, and a fixed pin must all agree
 * here first.
 */
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { describe, expect, it } from "vitest";

import { deriveSeed, packPhraseBytes } from "./passkey-seed";

const hex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

const unhex = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(text.match(/../g) ?? [], (c) => parseInt(c, 16));

/** Official BIP-39 vectors (Trezor): [entropy, phrase, seed]. */
const VECTORS: [string, string, string][] = [
  [
    "00000000000000000000000000000000",
    "abandon abandon abandon abandon abandon abandon abandon abandon " +
      "abandon abandon abandon about",
    "c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e5349553" +
      "1f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04",
  ],
  [
    "0000000000000000000000000000000000000000000000000000000000000000",
    "abandon abandon abandon abandon abandon abandon abandon abandon " +
      "abandon abandon abandon abandon abandon abandon abandon abandon " +
      "abandon abandon abandon abandon abandon abandon abandon art",
    "bda85446c68413707090a52022edd26a1c9462295029f2e60cd7c4f2bbd30971" +
      "70af7a4d73245cafa9c3cca8d561a7c3de6f5d4a10be8ed2a5e608d68f92fcc8",
  ],
  [
    "7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f",
    "legal winner thank year wave sausage worth useful legal winner " +
      "thank year wave sausage worth useful legal winner thank year " +
      "wave sausage worth title",
    "bc09fca1804f7e69da93c2f2028eb238c227f2e9dda30cd63699232578480a40" +
      "21b146ad717fbb7e451ce9eb835f43620bf5c514db0f8add49f5d121449d3e87",
  ],
];

describe("passkey seed math", () => {
  it("packs the official BIP-39 vectors' phrases", async () => {
    for (const [entropy, phrase] of VECTORS) {
      expect(
        new TextDecoder().decode(await packPhraseBytes(unhex(entropy)))
      ).toBe(phrase);
    }
  });

  it("matches the official BIP-39 vectors' seeds", async () => {
    for (const [entropy, , seed] of VECTORS) {
      expect(hex(await deriveSeed(unhex(entropy), "TREZOR"))).toBe(seed);
    }
  });

  it("matches the @scure string-path seeds byte for byte", async () => {
    // Deterministic corpus: a seeded xorshift, so a failure reproduces.
    let state = 0x1a2b3c4d;
    const nextByte = (): number => {
      state ^= state << 13;
      state |= 0;
      state ^= state >>> 17;
      state ^= state << 5;
      state |= 0;
      return state & 255;
    };
    for (const length of [16, 16, 20, 24, 28, 32, 32, 32, 32]) {
      const entropy: Uint8Array<ArrayBuffer> = Uint8Array.from(
        { length },
        nextByte
      );
      const ours = await deriveSeed(entropy);
      const theirs = mnemonicToSeedSync(
        entropyToMnemonic(entropy, wordlist)
      );
      expect(hex(ours)).toBe(hex(theirs));
      // deriveSeed leaves its phrase bytes zeroed; the seed is the
      // caller's to zero (withPrfSeed does). The corpus re-encodes from
      // the untouched entropy, so this must hold on every iteration.
      expect(entropy.some((b) => b !== 0)).toBe(true);
    }
  });

  it("pins a fixed entropy's seed", async () => {
    // The ASCII of "zillions" four times over.
    const entropy = unhex(
      "7a696c6c696f6e737a696c6c696f6e737a696c6c696f6e737a696c6c696f6e73"
    );
    expect(hex(await deriveSeed(entropy))).toBe(
      "a2c02949357aa555a4255ae39d03987c922e06b5d39d8e93a8b5a7102b460272" +
        "0c1bca97281ccbb2ca5e91080c54251427ec1265b41b561a16360dc1d0e08926"
    );
  });
});
