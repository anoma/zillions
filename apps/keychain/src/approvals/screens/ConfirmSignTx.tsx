/**
 * Final sign confirmation: re-verifies the password when the 30-minute auth
 * window expired, then submits the approved sign request (the background
 * decrypts the seed and signs the PCZT) and closes. A hardware-wallet
 * account's PCZT is signed on the device from here instead — the device's
 * own Sign view runs the session and hands over its opaque signing output,
 * which its engine verifies and folds into the PCZT keyring-side.
 */
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert, Input, Stack } from "@zillions/components";

import { wallets } from "../../hardware";
import type { DeviceSignTx } from "../../ipc/contract";
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
  // Undefined until known; null when the keys aren't on a device.
  const [device, setDevice] = useState<DeviceSignTx | null>();

  // The background consumes the request on the first submit, and StrictMode
  // runs the auto-submit effect twice: a ref survives both, state would not.
  const submitted = useRef(false);

  const signTx = async (): Promise<void> => {
    if (submitted.current) return;
    submitted.current = true;
    setStatus(Status.Pending);
    try {
      // A PCZT covers transparent + shielded in a single signing pass.
      await client?.submitSignTx(msgId, signer);
      setStatus(Status.Completed);
    } catch (e) {
      setError(`${e}`);
      setStatus(Status.Failed);
    }
  };

  const rejectSignTx = async () => {
    await client?.rejectSignTx(msgId);
    await closeCurrentTab();
  };

  /** The signing device's own screen: session, progress and retries included. */
  const signOnDeviceView = (input: DeviceSignTx) => {
    const Sign = wallets[input.device].views.Sign;
    return (
      <Sign
        input={input}
        onResult={async (deviceData) => {
          // Opaque to the contract; the device's engine decodes it
          // keyring-side. Throws on a failed submit, which re-arms the
          // view's retry.
          await client?.submitSignTx(msgId, signer, deviceData);
          setStatus(Status.Completed);
        }}
        onCancel={() => void rejectSignTx()}
      />
    );
  };

  const handleApproveSignTx = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault();

      try {
        if (requiresAuth) {
          setStatus(Status.Pending);
          setStatusInfo(`Decrypting keys and signing transaction...`);
          const isAuthenticated = await client?.checkPassword(password);

          if (!isAuthenticated) {
            throw new Error("Invalid password!");
          }
        }
      } catch (e) {
        setError(`${e}`);
        setStatus(Status.Failed);
        return;
      }

      if (device) {
        setStatus(undefined);
        setRequiresAuth(false);
        return;
      }
      await signTx();
    },
    [requiresAuth, password, device],
  );

  useEffect(() => {
    client
      ?.requiresAuth()
      .then((isAuthRequired) => setRequiresAuth(isAuthRequired))
      .catch((e) => console.error(e));
    client
      ?.queryDeviceSignTx(msgId)
      .then(setDevice)
      .catch((e: unknown) => {
        setError(`${e}`);
        setStatus(Status.Failed);
      });
  }, []);

  useEffect(() => {
    // User is authenticated with a valid session, so submit signed Tx:
    if (requiresAuth !== false || device === undefined || device) return;
    void signTx();
  }, [requiresAuth, device]);

  useEffect(() => {
    if (status === Status.Completed) void closeCurrentTab();
  }, [status]);

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
        {!requiresAuth && device && signOnDeviceView(device)}
        {!requiresAuth &&
          !device &&
          (status === Status.Failed ? (
            <Alert type="error">{error}</Alert>
          ) : (
            <Alert type="warning">Submitting signature</Alert>
          ))}
        <div className="flex-1" />
        {requiresAuth && (
          <ApprovalActions
            onReject={() => navigate(-1)}
            rejectLabel="Back"
            approveLabel="Authenticate"
            approveDisabled={
              !password || status === Status.Pending || submitted.current
            }
          />
        )}
      </Stack>
    </Stack>
  );
};
