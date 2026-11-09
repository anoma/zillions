/**
 * io-ts-validated storage over `browser.storage.local`. Holds the dapp
 * connections (each origin and the wallets it may see), and the auto-lock
 * setting.
 */
import { KVStore } from "@zillions/storage";
import * as E from "fp-ts/Either";
import * as t from "io-ts";

import { ExtStorage } from "./Storage";

const Connection = t.type({
  /** Wallet (parent account) ids the user shared with the origin. */
  accounts: t.array(t.string),
  /** The one of `accounts` the origin sees keys for and signs with. */
  current: t.string,
});
export type Connection = t.TypeOf<typeof Connection>;
const Connections = t.record(t.string, Connection);
type ConnectionsType = t.TypeOf<typeof Connections>;

type LocalStorageTypes = ConnectionsType | number;

// Replaces the "zillionsExtensionApprovedOrigins" origin list, which bound no
// account; origins approved there must connect again.
export type LocalStorageKeys =
  | "zillionsExtensionConnections"
  | "zillionsExtensionAutoLockMinutes";

const CONNECTIONS_KEY: LocalStorageKeys = "zillionsExtensionConnections";
const AUTO_LOCK_KEY: LocalStorageKeys = "zillionsExtensionAutoLockMinutes";

export const AUTO_LOCK_OPTIONS = [0, 5, 15, 30, 60] as const;
export const DEFAULT_AUTO_LOCK_MINUTES = 15;

export class LocalStorage extends ExtStorage {
  constructor(provider: KVStore<LocalStorageTypes>) {
    super(provider);
  }

  async getConnections(): Promise<ConnectionsType> {
    const decoded = t
      .union([Connections, t.undefined])
      .decode(await this.getRaw(CONNECTIONS_KEY));
    if (E.isLeft(decoded)) {
      throw new Error("Connections are not valid");
    }
    return decoded.right ?? {};
  }

  async setConnection(origin: string, connection: Connection): Promise<void> {
    await this.setRaw(CONNECTIONS_KEY, {
      ...(await this.getConnections()),
      [origin]: connection,
    });
  }

  async removeConnection(origin: string): Promise<void> {
    const { [origin]: _removed, ...rest } = await this.getConnections();
    await this.setRaw(CONNECTIONS_KEY, rest);
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
}
