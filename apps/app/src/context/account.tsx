import { createContext } from "react";
import type { KeychainAccount } from "../lib/keychain/keychain";

/** The keychain only shares these for the active account and its children. */
export type ShieldedAccount = KeychainAccount &
  Required<Pick<KeychainAccount, "viewingKey" | "seedFingerprint" | "hdIndex">>;

export const hasViewingKeys = (a: KeychainAccount): a is ShieldedAccount =>
  a.viewingKey !== undefined &&
  a.seedFingerprint !== undefined &&
  a.hdIndex !== undefined;

export type Account = {
  transparent: KeychainAccount;
  shielded: ShieldedAccount;
};

export const AccountContext = createContext<Account | undefined>(undefined);
