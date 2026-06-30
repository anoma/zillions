import { useContext } from "react";
import { AccountContext, type Account } from "../context/account";
import { invariant } from "../lib/invariant";

export function useAccount(): Account {
  const account = useContext(AccountContext);
  invariant(account, "account is not defined");
  return account;
}
