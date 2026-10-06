/**
 * Final sign confirmation: re-verifies the password when the 30-minute auth
 * window expired, then submits the approved sign request (the background
 * decrypts the seed and signs the PCZT) and closes.
 */
import { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert, Input, Stack } from "@zillions/components";

import { PageHeader } from "../../popup/ui/PageHeader";
import { ClientContext, type ApprovalDetails } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";
import { Status } from "../types";
import { ApprovalActions } from "../ui/ApprovalActions";
import { StatusBox } from "../ui/StatusBox";

type Props = {
  details: ApprovalDetails;
};

export const ConfirmSignTx = ({ details }: Props) => {
  const { msgId, signer } = details;

  const navigate = useNavigate();
  const client = useContext(ClientContext);
  const [password, setPassword] = useState("");
  const [requiresAuth, setRequiresAuth] = useState<boolean>();
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<Status>();
  const [statusInfo, setStatusInfo] = useState("");

  const signTx = async (): Promise<void> => {
    setStatus(Status.Pending);
    // A PCZT covers transparent + shielded in a single signing pass.
    await client?.submitSignTx(msgId, signer);
  };

  const handleApproveSignTx = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault();

      try {
        if (requiresAuth) {
          setStatusInfo(`Decrypting keys and signing transaction...`);
          const isAuthenticated = await client?.checkPassword(password);

          if (!isAuthenticated) {
            throw new Error("Invalid password!");
          }
        }

        await signTx();
        setStatus(Status.Completed);
      } catch (e) {
        setError(`${e}`);
        setStatus(Status.Failed);
      }
    },
    [requiresAuth, password]
  );

  useEffect(() => {
    if (status === undefined && typeof requiresAuth === "undefined") {
      client
        ?.requiresAuth()
        .then((isAuthRequired) => setRequiresAuth(isAuthRequired))
        .catch((e) => console.error(e));
    }

    if (typeof requiresAuth !== "undefined" && !requiresAuth) {
      // User is authenticated with a valid session, so submit signed Tx:
      signTx()
        .then(() => setStatus(Status.Completed))
        .catch((e) => {
          setError(`${e}`);
          setStatus(Status.Failed);
        });
    }

    if (status === Status.Completed) {
      void closeCurrentTab();
    }
  }, [status, requiresAuth]);

  return (
    <Stack className="h-full text-black pt-4 pb-6" gap={4}>
      <PageHeader title={requiresAuth ? "Verify" : "Signing transaction"} />
      <Stack
        full
        as="form"
        onSubmit={(e: React.FormEvent) => void handleApproveSignTx(e)}
      >
        {requiresAuth && (
          <>
            <StatusBox
              status={status}
              idleText="Verify your password to continue"
              pendingText={statusInfo}
              errorText={error}
            />
            <Input
              variant="Password"
              label={"Password"}
              onChange={(e) => setPassword(e.target.value)}
            />
          </>
        )}
        {!requiresAuth && <Alert type="warning">Submitting signature</Alert>}
        <div className="flex-1" />
        {requiresAuth && (
          <ApprovalActions
            onReject={() => navigate(-1)}
            rejectLabel="Back"
            approveLabel="Authenticate"
            approveDisabled={!password || status === Status.Pending}
          />
        )}
      </Stack>
    </Stack>
  );
};
