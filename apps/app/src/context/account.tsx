import { createContext } from "react";
import type { KeychainAccount } from "../lib/keychain/keychain";

export const AccountContext = createContext<KeychainAccount | undefined>(
  undefined,
);
