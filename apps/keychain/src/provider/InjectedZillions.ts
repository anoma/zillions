/**
 * The provider object dapps see as `window.zc` (MAIN world). Implements the
 * full shared `Zillions` interface so dapps typed against @zillions/types work
 * unchanged: the connection lifecycle, account queries, PCZT signing,
 * default-account updates, and `getSigner` are all live. Only the
 * disposable-keypair methods reject with a clear "not supported yet" error.
 *
 * `chainId` arguments are accepted for interface compatibility and ignored —
 * Zcash is the only chain.
 */
import {
  Events,
  type AccountInfo,
  type ClaimLinkProps,
  type ClearDisposableSignerProps,
  type CompactChunk,
  type DecryptCompactProps,
  type DecryptFullProps,
  type FullChunk,
  type OpenLinkKeyProps,
  type GenDisposableSignerResponse,
  type Zillions as IZillions,
  type Signer as ISigner,
  type PcztBase64,
  type PersistDisposableSignerProps,
  type ProveStage,
  type ProvedTx,
  type SendTxProps,
  type SignProps,
  type TransparentAddressesProps,
  type ZCashKeychainAccount,
} from "@zillions/types";

import { InjectedProxy } from "./InjectedProxy";
import { Signer } from "./Signer";

const notSupported = (method: string): never => {
  throw new Error(`zc.${method} is not supported yet by the Zillions Keychain`);
};

/** Calls `onStage` with each proving step the Keychain reports while `run` lasts. */
const withStages = async <T>(
  onStage: ((stage: ProveStage) => void) | undefined,
  run: () => Promise<T>,
): Promise<T> => {
  if (!onStage) return run();
  const listener = (e: Event) => {
    const { detail } = e as CustomEvent<unknown>;
    if (typeof detail === "string") onStage(detail as ProveStage);
  };
  window.addEventListener(Events.ProveStage, listener);
  try {
    return await run();
  } finally {
    window.removeEventListener(Events.ProveStage, listener);
  }
};

export class InjectedZillions implements IZillions {
  constructor(private readonly _version: string) { }

  public async connect(_chainId?: string): Promise<void> {
    return await InjectedProxy.requestMethod<undefined, void>("connect");
  }

  public async disconnect(_chainId?: string): Promise<void> {
    return await InjectedProxy.requestMethod<undefined, void>("disconnect");
  }

  public async isConnected(_chainId?: string): Promise<boolean> {
    return await InjectedProxy.requestMethod<undefined, boolean>("isConnected");
  }

  public async accounts(): Promise<ZCashKeychainAccount[]> {
    return await InjectedProxy.requestMethod<undefined, ZCashKeychainAccount[]>(
      "accounts",
    );
  }

  public async defaultAccount(): Promise<ZCashKeychainAccount> {
    return await InjectedProxy.requestMethod<undefined, ZCashKeychainAccount>(
      "defaultAccount",
    );
  }

  public async updateDefaultAccount(address: string): Promise<void> {
    return await InjectedProxy.requestMethod<string, void>(
      "updateDefaultAccount",
      address,
    );
  }

  public async sign(props: SignProps): Promise<PcztBase64> {
    return await InjectedProxy.requestMethod<SignProps, PcztBase64>(
      "sign",
      props,
    );
  }

  public async sealLinkKey(key: string): Promise<string> {
    return await InjectedProxy.requestMethod<string, string>(
      "sealLinkKey",
      key,
    );
  }

  public async openLinkKey(props: OpenLinkKeyProps): Promise<string> {
    return await InjectedProxy.requestMethod<OpenLinkKeyProps, string>(
      "openLinkKey",
      props,
    );
  }

  public async decryptCompact(props: DecryptCompactProps): Promise<CompactChunk> {
    return await InjectedProxy.requestMethod<DecryptCompactProps, CompactChunk>(
      "decryptCompact",
      props,
    );
  }

  public async decryptFull(props: DecryptFullProps): Promise<FullChunk> {
    return await InjectedProxy.requestMethod<DecryptFullProps, FullChunk>(
      "decryptFull",
      props,
    );
  }

  public async accountInfo(account?: string): Promise<AccountInfo> {
    return await InjectedProxy.requestMethod<string | undefined, AccountInfo>(
      "accountInfo",
      account,
    );
  }

  public async freshAddress(account?: string): Promise<string> {
    return await InjectedProxy.requestMethod<string | undefined, string>(
      "freshAddress",
      account,
    );
  }

  public async transparentAddresses(
    props: TransparentAddressesProps,
  ): Promise<string[]> {
    return await InjectedProxy.requestMethod<TransparentAddressesProps, string[]>(
      "transparentAddresses",
      props,
    );
  }

  public async sendTransaction(
    props: SendTxProps,
    onStage?: (stage: ProveStage) => void,
  ): Promise<ProvedTx> {
    return await withStages(onStage, () =>
      InjectedProxy.requestMethod<SendTxProps, ProvedTx>("sendTransaction", props),
    );
  }

  public async claimLink(
    props: ClaimLinkProps,
    onStage?: (stage: ProveStage) => void,
  ): Promise<ProvedTx> {
    return await withStages(onStage, () =>
      InjectedProxy.requestMethod<ClaimLinkProps, ProvedTx>("claimLink", props),
    );
  }

  public async genDisposableKeypair(): Promise<
    GenDisposableSignerResponse | undefined
  > {
    return notSupported("genDisposableKeypair");
  }

  public async persistDisposableKeypair(
    _props: PersistDisposableSignerProps,
  ): Promise<void> {
    return notSupported("persistDisposableKeypair");
  }

  public async clearDisposableKeypair(
    _props: ClearDisposableSignerProps,
  ): Promise<void> {
    return notSupported("clearDisposableKeypair");
  }

  public getSigner(): ISigner | undefined {
    return new Signer(this);
  }

  public version(): string {
    return this._version;
  }
}
