import type { PcztBase64 } from "./pczt";

export type SignArbitraryResponse = {
  hash: string;
  signature: string;
  /**
   * Compressed secp256k1 public key (33 bytes, hex) of the signing key, so the
   * caller can `verify` without separately obtaining it. Optional for backward
   * compatibility with consumers that predate the ZCash signing implementation.
   */
  publicKey?: string;
};

export type GenDisposableSignerResponse = {
  publicKey: string;
  address: string;
};

export interface Signer {
  /**
   * Sign a PCZT (base64-encoded postcard bytes). Returns the signed PCZT as
   * base64.
   */
  sign: (
    pczt: PcztBase64,
    signer?: string
  ) => Promise<PcztBase64 | undefined>;
  signArbitrary: (
    signer: string,
    data: string
  ) => Promise<SignArbitraryResponse | undefined>;
  verify: (publicKey: string, hash: string, signature: string) => Promise<void>;
  genDisposableKeypair: () => Promise<GenDisposableSignerResponse | undefined>;
  persistDisposableKeypair: (address: string) => Promise<void>;
  clearDisposableKeypair: (address: string) => Promise<void>;
}
