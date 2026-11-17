import type { ZCashKeychainAccount } from "./account";
import type { PcztBase64 } from "./pczt";
import type { GenDisposableSignerResponse, Signer } from "./signer";
import type {
  AccountInfo,
  ClaimLinkProps,
  CompactChunk,
  DecryptCompactProps,
  DecryptFullProps,
  FullChunk,
  ProveStage,
  ProvedTx,
  SendTxProps,
  TransparentAddressesProps,
} from "./wallet";

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
  /** Trial-decrypts a chunk's compact ciphertexts with the account's key. */
  decryptCompact(props: DecryptCompactProps): Promise<CompactChunk>;
  /** Reads a chunk's hits in full, and what the account sent in it. */
  decryptFull(props: DecryptFullProps): Promise<FullChunk>;
  /** The pools, shown transparent index and storage key of a shielded account. */
  accountInfo(account?: string): Promise<AccountInfo>;
  /** A new shielded address of the account, unlinkable to its others. */
  freshAddress(account?: string): Promise<string>;
  transparentAddresses(props: TransparentAddressesProps): Promise<string[]>;
  /**
   * Builds a transaction from the site's wallet snapshot, has the user
   * approve it, signs and proves it; the site broadcasts it.
   */
  sendTransaction(
    props: SendTxProps,
    onStage?: (stage: ProveStage) => void
  ): Promise<ProvedTx>;
  /** Builds and proves a payment link's claim into the site's account. */
  claimLink(
    props: ClaimLinkProps,
    onStage?: (stage: ProveStage) => void
  ): Promise<ProvedTx>;
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
