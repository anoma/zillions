/**
 * Final sign confirmation: re-verifies the password when the 30-minute auth
 * window expired, then submits the approved sign request (the background
 * decrypts the seed and signs the PCZT) and closes. A hardware-wallet
 * account's PCZT is signed on the device from here instead — the device's
 * own Sign view runs the session and hands over its opaque signing output,
 * which its engine verifies and folds into the PCZT keyring-side.
 */
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { CgSpinner } from "react-icons/cg";
import { useNavigate } from "react-router-dom";

import { wallets } from "../../hardware";
import type { DeviceSignTx } from "../../ipc/contract";
import { ActionBar, Button } from "../../popup/ui/Button";
import { Notice } from "../../popup/ui/Notice";
import { PasswordField } from "../../popup/ui/PasswordField";
import { ScreenHeader } from "../../popup/ui/ScreenHeader";
import { ClientContext, type ApprovalDetails } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";
import { Status } from "../types";

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
          setError(undefined);
          setStatus(Status.Pending);
          const isAuthenticated = await client?.checkPassword(password);

          if (!isAuthenticated) {
            throw new Error("Incorrect password");
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : `${e}`);
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
    <form
      className="flex flex-col flex-1"
      onSubmit={(e: React.FormEvent) => void handleApproveSignTx(e)}
    >
      <ScreenHeader title={requiresAuth ? "Confirm it's you" : "Signing"} />
      {requiresAuth && (
        <>
          <Notice tone="neutral" className="mt-3.5">
            It&apos;s been a while since you entered your password. Enter it to
            sign.
          </Notice>
          <div className="mt-4">
            <PasswordField
              autoFocus
              label="Password"
              value={password}
              error={status === Status.Failed ? error : undefined}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </>
      )}
      {!requiresAuth && device && (
        <div className="mt-3.5">{signOnDeviceView(device)}</div>
      )}
      {!requiresAuth &&
        !device &&
        (status === Status.Failed ? (
          <Notice tone="danger" title="Couldn't sign" className="mt-3.5">
            {error}
          </Notice>
        ) : (
          <div className="flex flex-col items-center gap-3 pt-24 text-[12.5px] font-medium text-muted">
            <CgSpinner className="size-6 animate-spin text-gold" />
            Signing transaction…
          </div>
        ))}
      {requiresAuth && (
        <ActionBar>
          <Button variant="secondary" onClick={() => navigate(-1)}>
            Back
          </Button>
          <Button
            type="submit"
            disabled={!password || status === Status.Pending || submitted.current}
          >
            Sign
          </Button>
        </ActionBar>
      )}
    </form>
  );
};
