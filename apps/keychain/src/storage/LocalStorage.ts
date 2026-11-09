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

type LocalStorageTypes = ConnectionsType | number | boolean;

// Replaces the "zillionsExtensionApprovedOrigins" origin list, which bound no
// account; origins approved there must connect again.
export type LocalStorageKeys =
  | "zillionsExtensionConnections"
  | "zillionsExtensionAutoLockMinutes"
  | "zillionsExtensionVaultCreated"
  | "zillionsExtensionVaultLost";

const CONNECTIONS_KEY: LocalStorageKeys = "zillionsExtensionConnections";
const AUTO_LOCK_KEY: LocalStorageKeys = "zillionsExtensionAutoLockMinutes";
// Kept here, not beside the vault in IndexedDB: Chrome may evict IndexedDB,
// but not `storage.local`, so a vault that vanishes leaves this behind.
const VAULT_CREATED_KEY: LocalStorageKeys = "zillionsExtensionVaultCreated";
const VAULT_LOST_KEY: LocalStorageKeys = "zillionsExtensionVaultLost";

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

  /** A password was set, so the vault holds a wallet. */
  async noteVaultCreated(): Promise<void> {
    await this.setRaw(VAULT_CREATED_KEY, true);
    await this.setRaw(VAULT_LOST_KEY, false);
  }

  /**
   * At startup, with no password in the vault: a vault created before can
   * only be gone because the browser deleted its data. Then its site grants
   * go too, and setup says so until a new password is set.
   */
  async noteVaultMissing(): Promise<void> {
    if ((await this.getRaw(VAULT_CREATED_KEY)) === true) {
      await this.setRaw(VAULT_LOST_KEY, true);
      await this.setRaw(CONNECTIONS_KEY, {});
    }
  }

  async vaultLost(): Promise<boolean> {
    return (await this.getRaw(VAULT_LOST_KEY)) === true;
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
