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
import type {
  ClearDisposableSignerProps,
  OpenLinkKeyProps,
  GenDisposableSignerResponse,
  Zillions as IZillions,
  Signer as ISigner,
  PcztBase64,
  PersistDisposableSignerProps,
  SignProps,
  ZCashKeychainAccount,
} from "@zillions/types";

import { InjectedProxy } from "./InjectedProxy";
import { Signer } from "./Signer";

const notSupported = (method: string): never => {
  throw new Error(`zc.${method} is not supported yet by the Zillions Keychain`);
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
