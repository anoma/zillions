import type { AccountType } from "../../ipc/contract";
import { CryptoRecord } from "../crypto/types";

export enum ResetPasswordError {
  BadPassword,
  KeyStoreError,
}

export type Vault<T = unknown> = {
  public: T;
  sensitive?: CryptoRecord;
};

export type VaultStoreData = Record<string, Vault[]>;

export type SessionValues = string | number;

/** Pointer to the active (parent) account, kept in the utility store. */
export type ActiveAccountStore = {
  id: string;
  type: AccountType;
};

export type UtilityStore = ActiveAccountStore;
