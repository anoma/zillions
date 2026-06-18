/**
 * io-ts-validated storage over `browser.storage.local`. Holds the
 * approved-origins list the dapp connection flow needs.
 */
import { KVStore } from "@zillions/storage";
import * as E from "fp-ts/Either";
import * as t from "io-ts";

import { ExtStorage } from "./Storage";

const ApprovedOrigins = t.array(t.string);
type ApprovedOriginsType = t.TypeOf<typeof ApprovedOrigins>;

type LocalStorageTypes = ApprovedOriginsType;

export type LocalStorageKeys = "zillionsExtensionApprovedOrigins";

const APPROVED_ORIGINS_KEY: LocalStorageKeys =
  "zillionsExtensionApprovedOrigins";

export class LocalStorage extends ExtStorage {
  constructor(provider: KVStore<LocalStorageTypes>) {
    super(provider);
  }

  async getApprovedOrigins(): Promise<ApprovedOriginsType | undefined> {
    const data = await this.getRaw(APPROVED_ORIGINS_KEY);

    const Schema = t.union([ApprovedOrigins, t.undefined]);
    const decodedData = Schema.decode(data);

    if (E.isLeft(decodedData)) {
      throw new Error("Approved Origins are not valid");
    }

    return decodedData.right;
  }

  async addApprovedOrigin(originToAdd: string): Promise<void> {
    const data = (await this.getApprovedOrigins()) || [];
    await this.setApprovedOrigins([...data, originToAdd]);
  }

  async removeApprovedOrigin(originToRemove: string): Promise<void> {
    const data = (await this.getApprovedOrigins()) || [];
    await this.setApprovedOrigins(
      data.filter((origin) => origin !== originToRemove)
    );
  }

  private async setApprovedOrigins(
    origins: ApprovedOriginsType
  ): Promise<void> {
    await this.setRaw(APPROVED_ORIGINS_KEY, origins);
  }
}
