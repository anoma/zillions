import { useContext, useEffect, useState } from "react";

import type { StoredAccount } from "../../ipc/contract";
import { ClientContext } from "../ApprovalsApp";

/** The parent accounts and the active one's id, for approval screens. */
export const useWallets = (enabled = true) => {
  const client = useContext(ClientContext);
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [activeId, setActiveId] = useState<string>();

  useEffect(() => {
    if (!client || !enabled) return;
    Promise.all([client.queryAccounts(), client.getActiveAccount()])
      .then(([list, active]) => {
        setAccounts(list);
        setActiveId(active?.id);
      })
      .catch(console.error);
  }, [client, enabled]);

  const wallets = accounts.filter((a) => !a.parentId);
  return {
    accounts,
    wallets,
    active: wallets.find((a) => a.id === activeId),
  };
};
