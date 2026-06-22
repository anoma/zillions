import { useMemo, type ReactNode } from "react";
import { AccountContext } from "../context/account";
import { invariant } from "../lib/invariant";
import type { KeychainAccount } from "../lib/keychain/keychain";
import { Wallet } from "../lib/wallet/wallet";

export function AccountProvider({
  keychainAccount,
  children,
}: {
  keychainAccount: KeychainAccount;
  children: ReactNode;
}) {
  const account = useMemo(() => {
    invariant(
      "viewingKey" in keychainAccount && keychainAccount.viewingKey,
      "shielded account not available",
    );

    const wallet = new Wallet({
      name: keychainAccount.id,
      ufvk: keychainAccount.viewingKey,
      birthday: 3337500, // TODO explore the best way to get the birthday
    });
    wallet.sync();

    return {
      keychain: keychainAccount,
      wallet,
    };
  }, [keychainAccount]);

  return (
    <AccountContext.Provider value={account}>
      {children}
    </AccountContext.Provider>
  );
}
