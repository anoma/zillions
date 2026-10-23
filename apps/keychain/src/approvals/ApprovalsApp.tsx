/**
 * Approvals window composition root. Opened by the background's
 * ApprovalsService as `approvals.html#<route>?interfaceOrigin=...`; every
 * screen is wrapped in WithAuth so a locked vault shows the Login gate first.
 */
import {
  Component,
  createContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from "react";
import { HashRouter, Route, Routes } from "react-router-dom";

import { Alert, Container } from "@zillions/components";
import type { PcztSummary } from "@zillions/types";

import { BackgroundClient, createBackgroundClient } from "../ipc/client";
import routes from "./routes";
import { ApproveConnection } from "./screens/ApproveConnection";
import { ApproveDisconnection } from "./screens/ApproveDisconnection";
import { ApproveSignTx } from "./screens/ApproveSignTx";
import { ApproveOpenLinkKey } from "./screens/ApproveOpenLinkKey";
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

/** Without it, a render crash unmounts everything and leaves a blank window. */
class ErrorBoundary extends Component<{ children: ReactNode }> {
  state: { error?: unknown } = {};

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  render() {
    return this.state.error ?
        <Alert type="error">{`${this.state.error}`}</Alert>
      : this.props.children;
  }
}

export const ApprovalsApp = () => {
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
            <ErrorBoundary>
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
                  path={routes.approveOpenLinkKey()}
                  element={
                    <WithAuth>
                      <ApproveOpenLinkKey />
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
            </ErrorBoundary>
          </ExtensionLockContext.Provider>
        </ClientContext.Provider>
      </Container>
    </HashRouter>
  );
};
