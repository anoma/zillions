import { useMemo, type ReactNode } from "react";
import {
  AccountContext,
  type Account,
  type ShieldedAccount,
} from "../context/account";
import type { KeychainAccount } from "../lib/keychain/keychain";

export function AccountProvider({
  shieldedAccount,
  transparentAccount,
  children,
}: {
  shieldedAccount: ShieldedAccount;
  transparentAccount: KeychainAccount;
  children: ReactNode;
}) {
  const account: Account = useMemo(() => {
    return {
      transparent: transparentAccount,
      shielded: shieldedAccount,
    };
  }, [shieldedAccount, transparentAccount]);

  return (
    <AccountContext.Provider value={account}>
      {children}
    </AccountContext.Provider>
  );
}
