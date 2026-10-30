/**
 * ApprovalLog: the Keychain's own record of what the user approved or
 * rejected, per site. Not chain history: only the decisions taken in approval
 * windows. Encrypted with the vault's session key like every other secret, so
 * it reads and writes only while the Keychain is unlocked.
 */
import type { KVStore } from "@zillions/storage";
import { v4 as uuid } from "uuid";

import type { ApprovalLogEntry } from "../../ipc/contract";
import type { CryptoRecord } from "../crypto/crypto";
import type { VaultService } from "../vault";

const LOG_KEY = "entries";
const MAX_ENTRIES = 200;

export class ApprovalLog {
  constructor(
    private readonly store: KVStore<CryptoRecord>,
    private readonly vaultService: VaultService
  ) {}

  /** Newest first; empty while locked. */
  async entries(): Promise<ApprovalLogEntry[]> {
    if (await this.vaultService.isLocked()) return [];
    const sealed = await this.store.get(LOG_KEY);
    return (await this.vaultService.reveal<ApprovalLogEntry[]>(sealed)) ?? [];
  }

  /**
   * Never throws: a lost entry must not fail the approval it records. A
   * decision taken while locked (a closed login window) is not recorded.
   */
  async record(entry: Omit<ApprovalLogEntry, "id" | "at">): Promise<void> {
    try {
      const entries = await this.entries();
      if (await this.vaultService.isLocked()) return;
      const next = [{ ...entry, id: uuid(), at: Date.now() }, ...entries];
      await this.write(next.slice(0, MAX_ENTRIES));
    } catch (e) {
      console.warn("Approval log: entry not recorded", e);
    }
  }

  async clear(): Promise<void> {
    await this.store.set(LOG_KEY, null);
  }

  /** Re-encrypts under the current session key (after a password change). */
  async write(entries: ApprovalLogEntry[]): Promise<void> {
    await this.store.set(
      LOG_KEY,
      await this.vaultService.encryptSensitiveData(entries)
    );
  }
}
