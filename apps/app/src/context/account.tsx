import { createContext } from "react";
import type { KeychainAccount } from "../lib/keychain/keychain";
import { Wallet } from "../lib/wallet/wallet";

export type Account = {
  keychain: KeychainAccount;
  wallet: Wallet;
};

export const AccountContext = createContext<Account | undefined>(undefined);
