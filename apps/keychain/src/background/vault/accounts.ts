/**
 * Account-record persistence on top of the encrypted vault.
 *
 * Separation of concerns: the vault module is the custodian of STORED data —
 * encrypted secrets (`VaultService`) and the public account records that
 * index them (this repository). The keyring module owns key semantics
 * (mnemonic generation, secret encoding, account/keypair construction) and
 * delegates all persistence and lookups here.
 */
import { KVStore } from "@zillions/storage";

import {
  KeyStore,
  KeyStoreType,
  SensitiveType,
  VaultStorage,
} from "../../storage";
import type { ActiveAccountStore, UtilityStore } from "./types";

/** Utility-store key holding the active (parent) account pointer. */
export const PARENT_ACCOUNT_ID_KEY = "parent-account-id";

export class AccountRepository {
  constructor(
    protected readonly vaultStorage: VaultStorage,
    protected readonly utilityStore: KVStore<UtilityStore>
  ) {}

  /** Persist one account record (public part + encrypted sensitive part). */
  public async add(entry: {
    public: KeyStoreType;
    sensitive: SensitiveType;
  }): Promise<void> {
    await this.vaultStorage.add(KeyStore, entry);
  }

  public async findByAddress(
    address: string
  ): Promise<KeyStoreType | undefined> {
    const entry = await this.vaultStorage.findOne(KeyStore, "address", address);
    return entry?.public;
  }

  public async findById(accountId: string): Promise<KeyStoreType | undefined> {
    const entry = await this.vaultStorage.findOne(KeyStore, "id", accountId);
    return entry?.public;
  }

  public async findAll(): Promise<KeyStoreType[]> {
    const entries = await this.vaultStorage.findAll(KeyStore);
    return entries.map((entry) => entry.public);
  }

  /** Number of stored account records. Feeds the keyring's deterministic id recipe. */
  public async count(): Promise<number> {
    return (await this.vaultStorage.findAll(KeyStore)).length;
  }

  /** The encrypted blob stored alongside an account's public record. */
  public async getSensitive(
    accountId: string
  ): Promise<SensitiveType | undefined> {
    const entry = await this.vaultStorage.findOne(KeyStore, "id", accountId);
    return entry?.sensitive;
  }

  /**
   * Rename an account, keeping its derived child accounts' aliases in sync.
   * Returns the updated parent record.
   */
  public async rename(
    accountId: string,
    alias: string
  ): Promise<KeyStoreType> {
    const parent = await this.vaultStorage.update(KeyStore, "id", accountId, {
      alias,
    });
    const children = await this.vaultStorage.findAll(
      KeyStore,
      "parentId",
      accountId
    );
    await Promise.all(
      children.map((c) =>
        this.vaultStorage.update(KeyStore, "id", c.public.id, { alias })
      )
    );
    return parent;
  }

  /**
   * Delete an account and its derived children. If the removed account was the
   * active one, repoint active to the first remaining parent (or clear it when
   * none remain).
   */
  public async remove(accountId: string): Promise<void> {
    const children = await this.vaultStorage.findAll(
      KeyStore,
      "parentId",
      accountId
    );
    const removedIds = new Set<string>([
      accountId,
      ...children.map((c) => c.public.id),
    ]);

    for (const id of removedIds) {
      await this.vaultStorage.remove(KeyStore, "id", id);
    }

    const active = await this.getActiveAccount();
    if (active && removedIds.has(active.id)) {
      const nextParent = (await this.findAll()).find((a) => !a.parentId);
      if (nextParent) {
        await this.setActiveAccount(
          nextParent.id,
          nextParent.type as ActiveAccountStore["type"]
        );
      } else {
        await this.utilityStore.set(PARENT_ACCOUNT_ID_KEY, null);
      }
    }
  }

  public async getActiveAccount(): Promise<ActiveAccountStore | undefined> {
    return await this.utilityStore.get(PARENT_ACCOUNT_ID_KEY);
  }

  public async setActiveAccount(
    id: string,
    type: ActiveAccountStore["type"]
  ): Promise<void> {
    await this.utilityStore.set(PARENT_ACCOUNT_ID_KEY, { id, type });
  }
}
