/**
 * io-ts-validated storage over `browser.storage.local`. Holds the
 * approved-origins list the dapp connection flow needs, and the auto-lock
 * setting.
 */
import { KVStore } from "@zillions/storage";
import * as E from "fp-ts/Either";
import * as t from "io-ts";

import { ExtStorage } from "./Storage";

const ApprovedOrigins = t.array(t.string);
type ApprovedOriginsType = t.TypeOf<typeof ApprovedOrigins>;

type LocalStorageTypes = ApprovedOriginsType | number;

export type LocalStorageKeys =
  | "zillionsExtensionApprovedOrigins"
  | "zillionsExtensionAutoLockMinutes";

const APPROVED_ORIGINS_KEY: LocalStorageKeys =
  "zillionsExtensionApprovedOrigins";
const AUTO_LOCK_KEY: LocalStorageKeys = "zillionsExtensionAutoLockMinutes";

export const AUTO_LOCK_OPTIONS = [0, 5, 15, 30, 60] as const;
export const DEFAULT_AUTO_LOCK_MINUTES = 15;

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

  /** Minutes of system idle time before locking; 0 never. */
  async getAutoLockMinutes(): Promise<number> {
    const data = await this.getRaw(AUTO_LOCK_KEY);
    return typeof data === "number" ? data : DEFAULT_AUTO_LOCK_MINUTES;
  }

  async setAutoLockMinutes(minutes: number): Promise<void> {
    if (!(AUTO_LOCK_OPTIONS as readonly number[]).includes(minutes)) {
      throw new Error(`Unsupported auto-lock value: ${minutes}`);
    }
    await this.setRaw(AUTO_LOCK_KEY, minutes);
  }

  private async setApprovedOrigins(
    origins: ApprovedOriginsType
  ): Promise<void> {
    await this.setRaw(APPROVED_ORIGINS_KEY, origins);
  }
}
