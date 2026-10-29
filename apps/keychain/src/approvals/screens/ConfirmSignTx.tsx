/**
 * Final sign confirmation: re-verifies the password when the 30-minute auth
 * window expired, then submits the approved sign request (the background
 * decrypts the seed and signs the PCZT) and closes. A hardware-wallet
 * account's PCZT is signed on the device from here instead, as the device's
 * transport needs a page, and its engine puts the signing output into the
 * PCZT keyring-side.
 */
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert, Input, Stack } from "@zillions/components";

import {
  initZillionsSdk,
  ledgerTransaction,
} from "../../background/crypto/zillions";
import { engines } from "../../hardware";
import { DeviceProgress } from "../../hardware/device-progress";
import {
  LEDGER_STEPS,
  signLedgerPczt,
  withLedger,
  type LedgerStep,
} from "../../hardware/ledger-session";
import type { DeviceSignTx } from "../../ipc/contract";
import { PageHeader } from "../../popup/ui/PageHeader";
import { ClientContext, type ApprovalDetails } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";
import { Status } from "../types";
import { ApprovalActions } from "../ui/ApprovalActions";
import { StatusBox } from "../ui/StatusBox";

const SIGN_STEPS: LedgerStep[] = ["connect", "unlock", "open-app", "sign"];

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
  /** Set while the device signs or after it failed. */
  const [ledgerStep, setLedgerStep] = useState<LedgerStep>();
  const abortLedger = useRef<AbortController>(undefined);

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

  const signOnDevice = async (): Promise<void> => {
    if (submitted.current || !device) return;
    submitted.current = true;
    setError(undefined);
    setStatus(Status.Pending);
    abortLedger.current = new AbortController();
    const { signal } = abortLedger.current;
    try {
      const signatures = await withLedger(
        setLedgerStep,
        async (ledger) => {
          await initZillionsSdk();
          const transaction = ledgerTransaction(device.pczt, device.hdIndex);
          return signLedgerPczt(ledger, transaction, setLedgerStep);
        },
        signal,
      );
      // Opaque to the contract; the Ledger engine decodes keyring-side.
      await client?.submitSignTx(msgId, signer, JSON.stringify(signatures));
      setStatus(Status.Completed);
    } catch (e) {
      // The request stays pending until the background takes the signatures.
      submitted.current = false;
      if (signal.aborted) return;
      setError(engines.ledger.describeError(e));
      setStatus(Status.Failed);
    }
  };

  const cancelLedger = async () => {
    abortLedger.current?.abort();
    await client?.rejectSignTx(msgId);
    await closeCurrentTab();
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
    if (requiresAuth !== false || device === undefined) return;
    if (device) void signOnDevice();
    else void signTx();
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
        {!requiresAuth && device && (
          <DeviceProgress
            steps={SIGN_STEPS.map((key) => LEDGER_STEPS[key])}
            current={ledgerStep ?? "connect"}
            error={status === Status.Failed ? error : undefined}
            onCancel={() => void cancelLedger()}
            onRetry={() => void signOnDevice()}
          />
        )}
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
