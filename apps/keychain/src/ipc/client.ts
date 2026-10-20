/**
 * BackgroundClient: the typed, UI-facing API over the IPC boundary.
 *
 * The UI calls named methods that infer their result type from the contract and
 * validate the response at runtime; it never builds envelopes or touches
 * `runtime.sendMessage` directly.
 */
import type { PcztSummary } from "@zillions/types";

import {
  message,
  type AccountStore,
  type AccountType,
  type ActiveAccount,
  type DerivedAccount,
  type IpcKind,
  type IpcRequest,
  type IpcResponse,
  type LedgerSignatures,
  type LedgerSignTx,
  type LockState,
  type MnemonicValidation,
  type ResetPasswordResult,
  type SpendingKeys,
  type StoredAccount,
} from "./contract";
import { createRuntimeTransport, type Transport } from "./transport";
import { validateResponse } from "./validate";

export class BackgroundClient {
  constructor(private readonly transport: Transport) {}

  /** Low-level typed send: infers the response from `kind`, validates it. */
  async send<K extends IpcKind>(
    kind: K,
    payload: IpcRequest<K>
  ): Promise<IpcResponse<K>> {
    const result = await this.transport.send(message(kind, payload));
    if (!result.ok) {
      const error = new Error(result.error.message);
      if (result.error.stack) error.stack = result.error.stack;
      throw error;
    }
    return validateResponse(kind, result.value);
  }

  // ---- vault ----

  isPasswordInitialized(): Promise<boolean> {
    return this.send("vault/isPasswordInitialized", {});
  }

  createPassword(password: string): Promise<void> {
    return this.send("vault/createPassword", { password });
  }

  /** Lock snapshot the popup gates on (password set? currently locked?). */
  lockState(): Promise<LockState> {
    return this.send("vault/lockState", {});
  }

  /** Attempt to unlock with `password`; resolves to whether it succeeded. */
  unlock(password: string): Promise<boolean> {
    return this.send("vault/unlock", { password });
  }

  lock(): Promise<void> {
    return this.send("vault/lock", {});
  }

  /** Re-verify the password without changing lock state (sensitive-action gate). */
  checkPassword(password: string): Promise<boolean> {
    return this.send("vault/checkPassword", { password });
  }

  /** Re-encrypt the vault under a new password (requires the current one). */
  resetPassword(
    oldPassword: string,
    newPassword: string
  ): Promise<ResetPasswordResult> {
    return this.send("vault/resetPassword", { oldPassword, newPassword });
  }

  /** Whether the 30-minute auth window expired (password re-check needed). */
  requiresAuth(): Promise<boolean> {
    return this.send("vault/requiresAuth", {});
  }

  // ---- keyring ----

  generateMnemonic(size: 12 | 24): Promise<string[]> {
    return this.send("keyring/generateMnemonic", { size });
  }

  validateMnemonic(phrase: string): Promise<MnemonicValidation> {
    return this.send("keyring/validateMnemonic", { phrase });
  }

  saveAccountSecret(
    input: IpcRequest<"keyring/saveAccountSecret">
  ): Promise<AccountStore> {
    return this.send("keyring/saveAccountSecret", input);
  }

  deriveShieldedAccount(
    input: IpcRequest<"keyring/deriveShieldedAccount">
  ): Promise<DerivedAccount> {
    return this.send("keyring/deriveShieldedAccount", input);
  }

  saveLedgerAccount(
    input: IpcRequest<"keyring/saveLedgerAccount">
  ): Promise<IpcResponse<"keyring/saveLedgerAccount">> {
    return this.send("keyring/saveLedgerAccount", input);
  }

  /** All stored account records (parents and their shielded children). */
  queryAccounts(): Promise<StoredAccount[]> {
    return this.send("keyring/queryAccounts", {});
  }

  getActiveAccount(): Promise<ActiveAccount | null> {
    return this.send("keyring/getActiveAccount", {});
  }

  setActiveAccount(id: string, type: AccountType): Promise<void> {
    return this.send("keyring/setActiveAccount", { id, type });
  }

  /** Reveal the seed phrase of a mnemonic account (vault must be unlocked). */
  revealMnemonic(accountId: string): Promise<string> {
    return this.send("keyring/revealMnemonic", { accountId });
  }

  /** Reveal the spending keys (Sapling Bech32 + unified hex) of a shielded account. */
  revealSpendingKey(accountId: string): Promise<SpendingKeys> {
    return this.send("keyring/revealSpendingKey", { accountId });
  }

  renameAccount(accountId: string, alias: string): Promise<StoredAccount> {
    return this.send("keyring/renameAccount", { accountId, alias });
  }

  deleteAccount(accountId: string): Promise<void> {
    return this.send("keyring/deleteAccount", { accountId });
  }

  // ---- approvals (trusted UIs: approval popup + settings) ----

  /** Whether `origin` is already approved (approval popup auto-approve check). */
  isConnectionApproved(origin: string): Promise<boolean> {
    return this.send("approvals/isConnectionApproved", { origin });
  }

  /** Resolve the pending connection request owned by this popup's tab. */
  resolveConnection(origin: string, allow: boolean): Promise<void> {
    return this.send("approvals/resolveConnection", { origin, allow });
  }

  /** Resolve the pending disconnection request owned by this popup's tab. */
  resolveDisconnection(origin: string, revoke: boolean): Promise<void> {
    return this.send("approvals/resolveDisconnection", { origin, revoke });
  }

  /** All currently approved origins. */
  connectedSites(): Promise<string[]> {
    return this.send("approvals/connectedSites", {});
  }

  /** Revoke a previously approved origin. */
  revokeConnection(origin: string): Promise<void> {
    return this.send("approvals/revokeConnection", { origin });
  }

  /** Display summary of the pending PCZT parked under `msgId`. */
  queryPcztSummary(msgId: string): Promise<PcztSummary> {
    return this.send("approvals/queryPcztSummary", { msgId });
  }

  /** The pending PCZT under `msgId` if a Ledger account signs it, else null. */
  queryLedgerSignTx(msgId: string): Promise<LedgerSignTx | null> {
    return this.send("approvals/queryLedgerSignTx", { msgId });
  }

  /** Confirm the pending sign request owned by this popup's tab. */
  submitSignTx(
    msgId: string,
    signer: string,
    ledgerSignatures?: LedgerSignatures
  ): Promise<void> {
    return this.send("approvals/submitSignTx", {
      msgId,
      signer,
      ledgerSignatures,
    });
  }

  /** Confirm the pending sign request owned by this popup's tab. */
  submitSignedTx(msgId: string, signed: string): Promise<void> {
    return this.send("approvals/submitSignedTx", { msgId, signed });
  }

  /** Reject the pending sign request owned by this popup's tab. */
  rejectSignTx(msgId: string): Promise<void> {
    return this.send("approvals/rejectSignTx", { msgId });
  }

  /** Confirm the pending default-account change owned by this popup's tab. */
  submitUpdateDefaultAccount(address: string): Promise<void> {
    return this.send("approvals/submitUpdateDefaultAccount", { address });
  }
}

/** Default client wired to the real extension transport. */
export const createBackgroundClient = (
  transport: Transport = createRuntimeTransport()
): BackgroundClient => new BackgroundClient(transport);
