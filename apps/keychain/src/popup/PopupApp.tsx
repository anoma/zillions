/**
 * Popup composition root: HashRouter + Vault/Account providers + shared chrome.
 *
 * Gate:
 *   - lock state still resolving → render nothing
 *   - no wallet yet            → open the Setup tab and close the popup
 *   - locked                   → Login
 *   - unlocked                 → routed wallet UI
 */
import { useEffect, useMemo } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

import { createBackgroundClient } from "../ipc/client";
import { AccountProvider } from "./context/AccountContext";
import { useVault, VaultProvider } from "./context/VaultContext";
import { openSetupTab } from "./openSetup";
import routes from "./routes";
import { AccountList } from "./screens/AccountList";
import { ApprovalLog } from "./screens/ApprovalLog";
import { AutoLock } from "./screens/AutoLock";
import { ChangePassword } from "./screens/ChangePassword";
import { ConnectedSites } from "./screens/ConnectedSites";
import { DeleteAccount } from "./screens/DeleteAccount";
import { ExportBackup } from "./screens/ExportBackup";
import { Login } from "./screens/Login";
import { RenameAccount } from "./screens/RenameAccount";
import { Settings } from "./screens/Settings";
import { SpendingKey } from "./screens/SpendingKey";
import { ThemeSetting } from "./screens/ThemeSetting";
import { ViewAccount } from "./screens/ViewAccount";
import { ViewingKey } from "./screens/ViewingKey";
import { ViewMnemonic } from "./screens/ViewMnemonic";
import { Screen } from "./ui/Screen";

const PopupShell = () => {
  const { lockStatus, passwordInitialized, unlock } = useVault();

  // No wallet yet → onboarding lives in a full-page tab; leave the popup.
  useEffect(() => {
    if (passwordInitialized === false) {
      void openSetupTab().finally(() => window.close());
    }
  }, [passwordInitialized]);

  if (lockStatus === "pending" || passwordInitialized === undefined) {
    return null;
  }
  if (passwordInitialized === false) {
    return null; // redirecting to the Setup tab
  }

  return (
    <main className="flex flex-col h-[600px] overflow-hidden bg-surface text-black">
      {lockStatus === "locked" ? (
        <Screen>
          <Login onLogin={unlock} />
        </Screen>
      ) : (
        <Screen>
          <Routes>
            <Route path={routes.accountList()} element={<AccountList />} />
            <Route path={routes.viewAccount()} element={<ViewAccount />} />
            <Route path={routes.viewMnemonic()} element={<ViewMnemonic />} />
            <Route path={routes.viewingKey()} element={<ViewingKey />} />
            <Route path={routes.viewSpendingKey()} element={<SpendingKey />} />
            <Route path={routes.renameAccount()} element={<RenameAccount />} />
            <Route path={routes.deleteAccount()} element={<DeleteAccount />} />
            <Route path={routes.settings()} element={<Settings />} />
            <Route path={routes.changePassword()} element={<ChangePassword />} />
            <Route path={routes.exportBackup()} element={<ExportBackup />} />
            <Route path={routes.connectedSites()} element={<ConnectedSites />} />
            <Route path={routes.autoLock()} element={<AutoLock />} />
            <Route path={routes.theme()} element={<ThemeSetting />} />
            <Route path={routes.approvalLog()} element={<ApprovalLog />} />
            <Route
              path="*"
              element={<Navigate to={routes.accountList()} replace />}
            />
          </Routes>
        </Screen>
      )}
    </main>
  );
};

export const PopupApp = () => {
  const client = useMemo(() => createBackgroundClient(), []);
  return (
    <HashRouter>
      <VaultProvider client={client}>
        <AccountProvider client={client}>
          <PopupShell />
        </AccountProvider>
      </VaultProvider>
    </HashRouter>
  );
};
