/**
 * Sign step after Approve, for requests the Approve click can't sign by
 * itself. A seed account always enters its password here: nothing on this
 * route signs without input, so reaching it by navigation alone signs
 * nothing. A hardware-wallet account re-verifies the password only when the
 * 30-minute auth window expired, then signs on the device — the device's own
 * Sign view runs the session and hands over its opaque signing output, which
 * its engine verifies and folds into the PCZT keyring-side.
 */
import { useCallback, useContext, useEffect, useRef, useState } from "react";
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
  const [passwordError, setPasswordError] = useState<string>();
  const [signError, setSignError] = useState<string>();
  const [status, setStatus] = useState<Status>();
  // Undefined until known; null when the keys aren't on a device.
  const [device, setDevice] = useState<DeviceSignTx | null>();
  const passwordStep = device === null || (!!device && requiresAuth === true);

  // The background consumes the request on the first submit: a second one
  // (double submit before the re-render) must not reach it.
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
      setSignError(`${e}`);
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

  const handleSubmit = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault();

      setPasswordError(undefined);
      setStatus(Status.Pending);
      try {
        if (!(await client?.checkPassword(password))) {
          throw new Error("Incorrect password");
        }
      } catch (e) {
        setPasswordError(e instanceof Error ? e.message : `${e}`);
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
    [password, device],
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
        setSignError(`${e}`);
        setStatus(Status.Failed);
      });
  }, []);

  useEffect(() => {
    if (status === Status.Completed) void closeCurrentTab();
  }, [status]);

  if (signError) {
    return (
      <>
        <ScreenHeader title="Signing" />
        <Notice tone="danger" title="Couldn't sign" className="mt-3.5">
          {signError}
        </Notice>
        <ActionBar>
          <Button variant="secondary" className="col-span-2" onClick={() => void closeCurrentTab()}>
            Close
          </Button>
        </ActionBar>
      </>
    );
  }

  return (
    <form
      className="flex flex-col flex-1"
      onSubmit={(e: React.FormEvent) => void handleSubmit(e)}
    >
      <ScreenHeader title={passwordStep ? "Confirm it's you" : "Signing"} />
      {passwordStep && (
        <>
          <Notice tone="neutral" className="mt-3.5">
            {requiresAuth
              ? "It's been a while since you entered your password. Enter it to sign."
              : "Enter your password to sign."}
          </Notice>
          <div className="mt-4">
            <PasswordField
              autoFocus
              label="Password"
              value={password}
              error={passwordError}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
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
        </>
      )}
      {device && requiresAuth === false && (
        <div className="mt-3.5">{signOnDeviceView(device)}</div>
      )}
    </form>
  );
};
