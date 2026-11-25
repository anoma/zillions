/**
 * AccountContext: the popup's account list + active-account pointer, over the
 * typed BackgroundClient. Fetches once the vault is unlocked; exposes the
 * active-account change plus reveal / rename / delete mutations.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren
} from "react";

import type { BackgroundClient } from "../../ipc/client";
import type {
  AccountType,
  SpendingKeys,
  StoredAccount,
} from "../../ipc/contract";
import { useVault } from "./VaultContext";

export type LoadStatus = "pending" | "completed" | "error";

type AccountContextValue = {
  accounts: StoredAccount[];
  /** Top-level (parent) accounts — those without a `parentId`. */
  parentAccounts: StoredAccount[];
  activeAccountId: string | undefined;
  status: LoadStatus;
  getById: (accountId: string) => StoredAccount | undefined;
  changeActiveAccount: (id: string, type: AccountType, shareWith?: string) => Promise<void>;
  revealMnemonic: (accountId: string) => Promise<string>;
  revealSpendingKey: (accountId: string) => Promise<SpendingKeys>;
  rename: (accountId: string, alias: string) => Promise<void>;
  remove: (accountId: string) => Promise<void>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

export const useAccounts = (): AccountContextValue => {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccounts must be used within <AccountProvider>");
  return ctx;
};

type ProviderProps = PropsWithChildren<{ client: BackgroundClient }>;

export const AccountProvider = ({
  client,
  children,
}: ProviderProps) => {
  const { lockStatus } = useVault();
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | undefined>();
  const [status, setStatus] = useState<LoadStatus>("pending");

  const fetchAll = useCallback(async (): Promise<void> => {
    setStatus("pending");
    try {
      const [list, active] = await Promise.all([
        client.queryAccounts(),
        client.getActiveAccount(),
      ]);
      setAccounts(list);
      setActiveAccountId(active?.id);
      setStatus("completed");
    } catch {
      setStatus("error");
    }
  }, [client]);

  // Load (and refresh) accounts whenever the vault becomes unlocked.
  useEffect(() => {
    if (lockStatus === "unlocked") void fetchAll();
  }, [lockStatus, fetchAll]);

  const changeActiveAccount = async (
    id: string,
    type: AccountType,
    shareWith?: string
  ): Promise<void> => {
    await client.setActiveAccount(id, type, shareWith);
    setActiveAccountId(id);
  };

  const getById = (accountId: string): StoredAccount | undefined =>
    accounts.find((a) => a.id === accountId);

  const revealMnemonic = (accountId: string): Promise<string> =>
    client.revealMnemonic(accountId);

  const revealSpendingKey = (accountId: string): Promise<SpendingKeys> =>
    client.revealSpendingKey(accountId);

  const rename = async (accountId: string, alias: string): Promise<void> => {
    await client.renameAccount(accountId, alias);
    await fetchAll();
  };

  const remove = async (accountId: string): Promise<void> => {
    await client.deleteAccount(accountId);
    await fetchAll();
  };

  const parentAccounts = accounts.filter((a) => !a.parentId);

  return (
    <AccountContext.Provider
      value={{
        accounts,
        parentAccounts,
        activeAccountId,
        status,
        getById,
        changeActiveAccount,
        revealMnemonic,
        revealSpendingKey,
        rename,
        remove,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
};
