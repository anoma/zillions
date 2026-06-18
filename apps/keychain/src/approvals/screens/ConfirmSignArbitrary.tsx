/**
 * Final arbitrary-sign confirmation: re-verifies the password when the
 * 30-minute auth window expired, then submits the approved sign-arbitrary
 * request (the background decrypts the seed and signs the message) and closes.
 */
import { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ActionButton, Alert, Input, Stack } from "@zillions/components";

import { PageHeader } from "../../popup/ui/PageHeader";
import { ClientContext, type ArbitraryDetails } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";
import { Status } from "../types";
import { StatusBox } from "../ui/StatusBox";

type Props = {
  details: ArbitraryDetails;
};

export const ConfirmSignArbitrary = ({ details }: Props): JSX.Element => {
  const { msgId } = details;

  const navigate = useNavigate();
  const client = useContext(ClientContext);
  const [password, setPassword] = useState("");
  const [requiresAuth, setRequiresAuth] = useState<boolean>();
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<Status>();
  const [statusInfo, setStatusInfo] = useState("");

  const signArbitrary = async (): Promise<void> => {
    setStatus(Status.Pending);
    await client?.submitSignArbitrary(msgId);
  };

  const handleApprove = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault();

      try {
        if (requiresAuth) {
          setStatusInfo(`Decrypting keys and signing data...`);
          const isAuthenticated = await client?.checkPassword(password);

          if (!isAuthenticated) {
            throw new Error("Invalid password!");
          }
        }

        await signArbitrary();
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
      // Authenticated within the session window — submit the signature now.
      signArbitrary()
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
    <Stack full className="py-4">
      <PageHeader title={requiresAuth ? "Verify" : "Signing message"} />
      <Stack
        full
        as="form"
        onSubmit={(e: React.FormEvent) => void handleApprove(e)}
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
        <Stack gap={2}>
          {requiresAuth && (
            <>
              <ActionButton disabled={!password || status === Status.Pending}>
                Authenticate
              </ActionButton>
              <ActionButton
                outlineColor="primary"
                type="button"
                onClick={() => navigate(-1)}
              >
                Back
              </ActionButton>
            </>
          )}
        </Stack>
      </Stack>
    </Stack>
  );
};
