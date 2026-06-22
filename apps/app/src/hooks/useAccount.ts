import { useContext } from "react";
import { AccountContext } from "../context/account";
import { invariant } from "../lib/invariant";
import type { KeychainAccount } from "../lib/keychain/keychain";

export function useAccount(): KeychainAccount {
  const account = useContext(AccountContext);
  invariant(account, "account is not defined");
  return account;
}
