import type { ZCashKeychainAccount } from "./account";
import type { PcztBase64 } from "./pczt";
import type { GenDisposableSignerResponse, Signer } from "./signer";

/**
 * Props for the PCZT sign flow.
 *
 * `pczt` is a base64-encoded PCZT (the postcard bytes from `pczt.serialize()`).
 * `signer` is optional; when omitted the keyring resolves the spend's account.
 */
export type SignProps = {
  signer?: string;
  pczt: PcztBase64;
};

export type OpenLinkKeyProps = {
  sealed: string;
  nk: string;
};

export type BalancesProps = {
  owner: string;
  tokens: string[];
};

export type PersistDisposableSignerProps = {
  address: string;
};

export type ClearDisposableSignerProps = {
  address: string;
};

export interface Zillions {
  accounts(): Promise<readonly ZCashKeychainAccount[] | undefined>;
  connect(chainId?: string): Promise<void>;
  disconnect(chainId?: string): Promise<void>;
  isConnected(chainId?: string): Promise<boolean | undefined>;
  defaultAccount(): Promise<ZCashKeychainAccount | undefined>;
  updateDefaultAccount(address: string): Promise<void>;
  /**
   * Sign a PCZT. Returns the signed PCZT as base64 (postcard bytes).
   */
  sign(props: SignProps): Promise<PcztBase64>;
  /**
   * Seal a payment link's key (base64, 32 bytes) to the connected account, for
   * the link's funding memo. Only that account's seed opens it again.
   */
  sealLinkKey(key: string): Promise<string>;
  /**
   * Open a payment link's sealed key (hex, from its funding memo, with the
   * memo's `nk`) after the user approves; resolves with the key, base64.
   */
  openLinkKey(props: OpenLinkKeyProps): Promise<string>;
  genDisposableKeypair(): Promise<GenDisposableSignerResponse | undefined>;
  persistDisposableKeypair(props: PersistDisposableSignerProps): Promise<void>;
  clearDisposableKeypair(props: ClearDisposableSignerProps): Promise<void>;
  version: () => string;
}

export type WindowWithZc = Window &
  typeof globalThis & {
    zc: Zillions & {
      getSigner: () => Signer;
    };
  };
