import { createContext } from "react";
import type { KeychainAccount } from "../lib/keychain/keychain";

/** The keychain only shares these for the active account and its children. */
export type ShieldedAccount = KeychainAccount &
  Required<Pick<KeychainAccount, "seedFingerprint" | "hdIndex">>;

export const isShared = (a: KeychainAccount): a is ShieldedAccount =>
  a.seedFingerprint !== undefined && a.hdIndex !== undefined;

export type Account = {
  transparent: KeychainAccount;
  shielded: ShieldedAccount;
};

export const AccountContext = createContext<Account | undefined>(undefined);
