import { createContext } from "react";
import type { KeychainAccount } from "../lib/keychain/keychain";

export type Account = {
  transparent: KeychainAccount;
  shielded: KeychainAccount;
};

export const AccountContext = createContext<Account | undefined>(undefined);
