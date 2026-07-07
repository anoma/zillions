/**
 * Popup composition root: HashRouter + Vault/Account providers + shared chrome.
 *
 * Gate:
 *   - lock state still resolving → render nothing
 *   - no wallet yet            → open the Setup tab and close the popup
 *   - locked                   → Login
 *   - unlocked                 → routed wallet UI (account list / detail)
 */
import { useEffect, useMemo } from "react";
import {
  HashRouter,
  matchPath,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import { Container, Stack } from "@zillions/components";

import { createBackgroundClient } from "../ipc/client";
import { AccountProvider } from "./context/AccountContext";
import { useVault, VaultProvider } from "./context/VaultContext";
import { openSetupTab } from "./openSetup";
import routes from "./routes";
import { AccountList } from "./screens/AccountList";
import { ChangePassword } from "./screens/ChangePassword";
import { ConnectedSites } from "./screens/ConnectedSites";
import { DeleteAccount } from "./screens/DeleteAccount";
import { Login } from "./screens/Login";
import { RenameAccount } from "./screens/RenameAccount";
import { SpendingKey } from "./screens/SpendingKey";
import { ViewAccount } from "./screens/ViewAccount";
import { ViewingKey } from "./screens/ViewingKey";
import { ViewMnemonic } from "./screens/ViewMnemonic";
import { AppHeader } from "./ui/AppHeader";

const PopupShell = () => {
  const location = useLocation();
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

  const unlocked = lockStatus === "unlocked";
  const isRoot = Boolean(matchPath(routes.accountList(), location.pathname));
  const returnButton = unlocked && !isRoot;

  return (
    <Container
      size="popup"
      header={
        <AppHeader
          settingsButton={unlocked}
          lockButton={unlocked && !returnButton}
          returnButton={returnButton}
        />
      }
    >
      {lockStatus === "locked" ? (
        <Login onLogin={unlock} />
      ) : (
        // py-5 vertically centers page titles with the absolutely-positioned
        // header icons (Container's popup header is h-17, icons span it).
        <Stack className="py-5" full gap={6}>
          <Routes>
            <Route path={routes.accountList()} element={<AccountList />} />
            <Route path={routes.viewAccount()} element={<ViewAccount />} />
            <Route path={routes.viewMnemonic()} element={<ViewMnemonic />} />
            <Route path={routes.viewingKey()} element={<ViewingKey />} />
            <Route
              path={routes.viewSpendingKey()}
              element={<SpendingKey />}
            />
            <Route path={routes.renameAccount()} element={<RenameAccount />} />
            <Route path={routes.deleteAccount()} element={<DeleteAccount />} />
            <Route
              path={routes.changePassword()}
              element={<ChangePassword />}
            />
            <Route
              path={routes.connectedSites()}
              element={<ConnectedSites />}
            />
            <Route
              path="*"
              element={<Navigate to={routes.accountList()} replace />}
            />
          </Routes>
        </Stack>
      )}
    </Container>
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
