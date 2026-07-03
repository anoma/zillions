import type { PcztBase64 } from "./pczt";

export type GenDisposableSignerResponse = {
  publicKey: string;
  address: string;
};

export interface Signer {
  /**
   * Sign a PCZT (base64-encoded postcard bytes). Returns the signed PCZT as
   * base64.
   */
  sign: (pczt: PcztBase64, signer?: string) => Promise<PcztBase64 | undefined>;
  genDisposableKeypair: () => Promise<GenDisposableSignerResponse | undefined>;
  persistDisposableKeypair: (address: string) => Promise<void>;
  clearDisposableKeypair: (address: string) => Promise<void>;
}
