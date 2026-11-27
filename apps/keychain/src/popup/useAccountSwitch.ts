import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { createBackgroundClient } from "../ipc/client";
import type { StoredAccount } from "../ipc/contract";
import { useAccounts } from "./context/AccountContext";
import { useCurrentSite } from "./currentSite";
import routes from "./routes";

/**
 * "Use" an account: at once, unless the current tab's site is connected and
 * was never given it; then the user confirms sharing it first.
 */
export const useAccountSwitch = (): ((account: StoredAccount) => void) => {
  const client = useMemo(() => createBackgroundClient(), []);
  const site = useCurrentSite(client);
  const navigate = useNavigate();
  const { changeActiveAccount } = useAccounts();

  return (account) => {
    if (site?.connected && !site.shared.includes(account.id)) {
      void navigate(routes.shareAccount(account.id));
    } else {
      void changeActiveAccount(account.id, account.type);
    }
  };
};
