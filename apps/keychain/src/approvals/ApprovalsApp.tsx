/**
 * Approvals window composition root. Opened by the background's
 * ApprovalsService as `approvals.html#<route>?interfaceOrigin=...`; every
 * screen is wrapped in WithAuth so a locked vault shows the Login gate first.
 */
import {
  createContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { HashRouter, Route, Routes } from "react-router-dom";

import { Container } from "@zillions/components";
import type { PcztSummary } from "@zillions/types";

import { BackgroundClient, createBackgroundClient } from "../ipc/client";
import routes from "./routes";
import { ApproveConnection } from "./screens/ApproveConnection";
import { ApproveDisconnection } from "./screens/ApproveDisconnection";
import { ApproveSignTx } from "./screens/ApproveSignTx";
import { ApproveUpdateDefaultAccount } from "./screens/ApproveUpdateDefaultAccount";
import { ConfirmSignTx } from "./screens/ConfirmSignTx";
import { WithAuth } from "./WithAuth";

export type ExtensionLockContextType = {
  isUnlocked?: boolean;
  setIsUnlocked?: Dispatch<SetStateAction<boolean>>;
};
export const ExtensionLockContext = createContext<ExtensionLockContextType>(
  {}
);

export const ClientContext = createContext<BackgroundClient | null>(null);

/** The pending sign request, threaded from ApproveSignTx to ConfirmSignTx. */
export type ApprovalDetails = {
  msgId: string;
  signer: string;
  origin: string;
  summary: PcztSummary;
};

export const ApprovalsApp = (): JSX.Element => {
  const client = useMemo(() => createBackgroundClient(), []);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [details, setDetails] = useState<ApprovalDetails>();

  useEffect(() => {
    client
      .lockState()
      .then(({ isLocked }) => setIsUnlocked(!isLocked))
      .catch(() => setIsUnlocked(false));
  }, [client]);

  return (
    <HashRouter>
      <Container size="popup">
        <ClientContext.Provider value={client}>
          <ExtensionLockContext.Provider value={{ isUnlocked, setIsUnlocked }}>
            <Routes>
              <Route
                path={routes.approveConnection()}
                element={
                  <WithAuth>
                    <ApproveConnection />
                  </WithAuth>
                }
              />
              <Route
                path={routes.approveDisconnection()}
                element={
                  <WithAuth>
                    <ApproveDisconnection />
                  </WithAuth>
                }
              />
              <Route
                path={routes.approveUpdateDefaultAccount()}
                element={
                  <WithAuth>
                    <ApproveUpdateDefaultAccount />
                  </WithAuth>
                }
              />
              <Route
                path={routes.approveSignTx()}
                element={
                  <WithAuth>
                    <ApproveSignTx details={details} setDetails={setDetails} />
                  </WithAuth>
                }
              />
              <Route
                path={routes.confirmSignTx()}
                element={details && <ConfirmSignTx details={details} />}
              />
            </Routes>
          </ExtensionLockContext.Provider>
        </ClientContext.Provider>
      </Container>
    </HashRouter>
  );
};
