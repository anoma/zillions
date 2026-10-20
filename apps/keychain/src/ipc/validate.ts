/**
 * Runtime validators for IPC responses.
 *
 * The transport returns an `unknown` from the other realm; these guards verify
 * its shape before the UI trusts it as a typed `IpcResponse<K>`. Dependency-free
 * — each validator asserts only the fields the Setup flow consumes.
 */
import type { PcztSummary, ZCashKeychainAccount } from "@zillions/types";

import type {
  AccountStore,
  ActiveAccount,
  DerivedAccount,
  IpcKind,
  IpcResponse,
  LedgerSignTx,
  LockState,
  MnemonicValidation,
  ResetPasswordResult,
  StoredAccount,
} from "./contract";

class ResponseShapeError extends Error {
  constructor(kind: string, detail: string) {
    super(`Malformed IPC response for "${kind}": ${detail}`);
    this.name = "ResponseShapeError";
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const isAccountStore = (v: unknown): v is AccountStore =>
  isRecord(v) &&
  typeof v.id === "string" &&
  typeof v.alias === "string" &&
  typeof v.address === "string" &&
  typeof v.owner === "string" &&
  typeof v.type === "string";

const isDerivedAccount = (v: unknown): v is DerivedAccount =>
  isRecord(v) &&
  typeof v.id === "string" &&
  typeof v.alias === "string" &&
  typeof v.address === "string" &&
  typeof v.type === "string";

const isMnemonicValidation = (v: unknown): v is MnemonicValidation =>
  isRecord(v) && typeof v.isValid === "boolean";

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

const isStoredAccount = (v: unknown): v is StoredAccount =>
  isRecord(v) &&
  typeof v.id === "string" &&
  typeof v.alias === "string" &&
  typeof v.address === "string" &&
  typeof v.owner === "string" &&
  typeof v.type === "string";

const isStoredAccountArray = (v: unknown): v is StoredAccount[] =>
  Array.isArray(v) && v.every(isStoredAccount);

const isLockState = (v: unknown): v is LockState =>
  isRecord(v) &&
  typeof v.passwordInitialized === "boolean" &&
  typeof v.isLocked === "boolean";

const isResetPasswordResult = (v: unknown): v is ResetPasswordResult =>
  isRecord(v) &&
  (v.ok === true ||
    (v.ok === false && (v.error === "bad-password" || v.error === "keystore")));

const isActiveAccountOrNull = (v: unknown): v is ActiveAccount | null =>
  v === null ||
  (isRecord(v) && typeof v.id === "string" && typeof v.type === "string");

const isPublicAccount = (v: unknown): v is ZCashKeychainAccount =>
  isRecord(v) &&
  typeof v.id === "string" &&
  typeof v.alias === "string" &&
  typeof v.address === "string" &&
  typeof v.type === "string";

const isPublicAccountArray = (v: unknown): v is ZCashKeychainAccount[] =>
  Array.isArray(v) && v.every(isPublicAccount);

// Outputs must say whose they are: the approval's "Sending ..." line rests on it.
const isOutputArray = (v: unknown): boolean =>
  Array.isArray(v) &&
  v.every((o) => isRecord(o) && typeof o.mine === "boolean");

const isLedgerSignTxOrNull = (v: unknown): v is LedgerSignTx | null =>
  v === null ||
  (isRecord(v) && typeof v.pczt === "string" && typeof v.hdIndex === "number");

const isPcztSummary = (v: unknown): v is PcztSummary =>
  isRecord(v) &&
  typeof v.fee === "string" &&
  Array.isArray(v.transparentInputs) &&
  isOutputArray(v.transparentOutputs) &&
  Array.isArray(v.saplingInputs) &&
  isOutputArray(v.saplingOutputs) &&
  Array.isArray(v.orchardInputs) &&
  isOutputArray(v.orchardOutputs) &&
  Array.isArray(v.ironwoodInputs) &&
  isOutputArray(v.ironwoodOutputs);

/**
 * Validate (and narrow) a raw response for a given channel. Throws
 * `ResponseShapeError` if the background returned something off-contract.
 */
export const validateResponse = <K extends IpcKind>(
  kind: K,
  value: unknown
): IpcResponse<K> => {
  switch (kind) {
    case "vault/isPasswordInitialized":
      if (typeof value !== "boolean")
        throw new ResponseShapeError(kind, "expected boolean");
      return value as IpcResponse<K>;

    case "vault/createPassword":
    case "vault/lock":
    case "keyring/setActiveAccount":
    case "keyring/deleteAccount":
    case "dapp/connect":
    case "dapp/disconnect":
    case "dapp/updateDefaultAccount":
    case "approvals/resolveConnection":
    case "approvals/resolveDisconnection":
    case "approvals/revokeConnection":
    case "approvals/submitSignTx":
    case "approvals/submitSignedTx":
    case "approvals/rejectSignTx":
    case "approvals/submitUpdateDefaultAccount":
      // void — accept undefined/null
      return undefined as IpcResponse<K>;

    case "vault/lockState":
      if (!isLockState(value))
        throw new ResponseShapeError(kind, "expected LockState");
      return value as IpcResponse<K>;

    case "vault/unlock":
    case "vault/checkPassword":
    case "vault/requiresAuth":
    case "dapp/isConnected":
    case "approvals/isConnectionApproved":
      if (typeof value !== "boolean")
        throw new ResponseShapeError(kind, "expected boolean");
      return value as IpcResponse<K>;

    case "dapp/sign":
      if (typeof value !== "string")
        throw new ResponseShapeError(kind, "expected string (base64 PCZT)");
      return value as IpcResponse<K>;

    case "approvals/queryPcztSummary":
      if (!isPcztSummary(value))
        throw new ResponseShapeError(kind, "expected PcztSummary");
      return value as IpcResponse<K>;

    case "approvals/queryLedgerSignTx":
      if (!isLedgerSignTxOrNull(value))
        throw new ResponseShapeError(kind, "expected LedgerSignTx | null");
      return value as IpcResponse<K>;

    case "dapp/accounts":
      if (!isPublicAccountArray(value))
        throw new ResponseShapeError(kind, "expected ZCashKeychainAccount[]");
      return value as IpcResponse<K>;

    case "dapp/defaultAccount":
      if (value !== null && !isPublicAccount(value))
        throw new ResponseShapeError(
          kind,
          "expected ZCashKeychainAccount | null"
        );
      return value as IpcResponse<K>;

    case "approvals/connectedSites":
      if (!isStringArray(value))
        throw new ResponseShapeError(kind, "expected string[]");
      return value as IpcResponse<K>;

    case "vault/resetPassword":
      if (!isResetPasswordResult(value))
        throw new ResponseShapeError(kind, "expected ResetPasswordResult");
      return value as IpcResponse<K>;

    case "keyring/revealMnemonic":
      if (typeof value !== "string")
        throw new ResponseShapeError(kind, "expected string");
      return value as IpcResponse<K>;

    case "keyring/revealSpendingKey":
      if (
        !isRecord(value) ||
        typeof value.orchard !== "string" ||
        typeof value.sapling !== "string"
      )
        throw new ResponseShapeError(kind, "expected SpendingKeys");
      return value as IpcResponse<K>;

    case "keyring/renameAccount":
      if (!isStoredAccount(value))
        throw new ResponseShapeError(kind, "expected StoredAccount");
      return value as IpcResponse<K>;

    case "keyring/queryAccounts":
      if (!isStoredAccountArray(value))
        throw new ResponseShapeError(kind, "expected StoredAccount[]");
      return value as IpcResponse<K>;

    case "keyring/getActiveAccount":
      if (!isActiveAccountOrNull(value))
        throw new ResponseShapeError(kind, "expected ActiveAccount | null");
      return value as IpcResponse<K>;

    case "keyring/generateMnemonic":
      if (!isStringArray(value))
        throw new ResponseShapeError(kind, "expected string[]");
      return value as IpcResponse<K>;

    case "keyring/validateMnemonic":
      if (!isMnemonicValidation(value))
        throw new ResponseShapeError(kind, "expected MnemonicValidation");
      return value as IpcResponse<K>;

    case "keyring/saveAccountSecret":
      if (!isAccountStore(value))
        throw new ResponseShapeError(kind, "expected AccountStore");
      return value as IpcResponse<K>;

    case "keyring/deriveShieldedAccount":
      if (!isDerivedAccount(value))
        throw new ResponseShapeError(kind, "expected DerivedAccount");
      return value as IpcResponse<K>;

    case "keyring/saveLedgerAccount":
      if (
        !isRecord(value) ||
        !isAccountStore(value.parentAccount) ||
        (value.shieldedAccount !== undefined &&
          !isDerivedAccount(value.shieldedAccount)) ||
        typeof value.alreadyImported !== "boolean"
      )
        throw new ResponseShapeError(kind, "expected saved Ledger account");
      return value as IpcResponse<K>;

    default: {
      // Exhaustiveness: if a channel is added to the contract without a
      // validator, this line fails to compile.
      const _never: never = kind;
      throw new ResponseShapeError(String(_never), "no validator registered");
    }
  }
};
