/**
 * Thin `Signer` returned by `zc.getSigner()`: it delegates to the `Zillions`
 * provider, so dapps can use either `zc.sign(...)` or `zc.getSigner().sign(...)`
 * interchangeably. Disposable-keypair methods inherit the provider's "not
 * supported yet" behaviour.
 */
import {
  GenDisposableSignerResponse,
  Signer as ISigner,
  PcztBase64,
  Zillions as IZillions,
} from "@zillions/types";

export class Signer implements ISigner {
  constructor(private readonly _zc: IZillions) {}

  public async sign(
    pczt: PcztBase64,
    signer?: string
  ): Promise<PcztBase64 | undefined> {
    return await this._zc.sign({ signer, pczt });
  }

  public async genDisposableKeypair(): Promise<
    GenDisposableSignerResponse | undefined
  > {
    return await this._zc.genDisposableKeypair();
  }

  public async persistDisposableKeypair(address: string): Promise<void> {
    return await this._zc.persistDisposableKeypair({ address });
  }

  public async clearDisposableKeypair(address: string): Promise<void> {
    return await this._zc.clearDisposableKeypair({ address });
  }
}
