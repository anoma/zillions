/**
 * Final sign confirmation: re-verifies the password when the 30-minute auth
 * window expired, then submits the approved sign request (the background
 * decrypts the seed and signs the PCZT) and closes. A Ledger account's PCZT
 * is signed on the device from here instead, as WebHID needs a page and a
 * click, and the background puts the device's signatures in.
 */
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ActionButton, Alert, Input, Stack } from "@zillions/components";

import {
  initZillionsSdk,
  ledgerTransaction,
} from "../../background/crypto/zillions";
import type { LedgerSignTx } from "../../ipc/contract";
import { PageHeader } from "../../popup/ui/PageHeader";
import {
  ledgerErrorMessage,
  signLedgerPczt,
  withLedger,
  type LedgerStep,
} from "../../setup/model/ledger";
import { LedgerProgress } from "../../setup/ui/LedgerProgress";
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
  // Undefined until known; null when the account isn't a Ledger's.
  const [ledger, setLedger] = useState<LedgerSignTx | null>();
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

  const signOnLedger = async (): Promise<void> => {
    if (submitted.current || !ledger) return;
    submitted.current = true;
    setError(undefined);
    setStatus(Status.Pending);
    abortLedger.current = new AbortController();
    const { signal } = abortLedger.current;
    try {
      // Connecting comes first, while the click still counts as one:
      // WebHID's picker needs it.
      const signatures = await withLedger(
        setLedgerStep,
        async (device) => {
          await initZillionsSdk();
          const transaction = ledgerTransaction(ledger.pczt, ledger.hdIndex);
          return signLedgerPczt(device, transaction, setLedgerStep);
        },
        signal
      );
      await client?.submitSignTx(msgId, signer, signatures);
      setStatus(Status.Completed);
    } catch (e) {
      // The request stays pending until the background takes the signatures.
      submitted.current = false;
      if (signal.aborted) return;
      setError(ledgerErrorMessage(e));
      setStatus(Status.Failed);
    }
  };

  const cancelLedger = () => {
    abortLedger.current?.abort();
    setLedgerStep(undefined);
    setError(undefined);
    setStatus(undefined);
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

      // The device waits for a click of its own.
      if (ledger) {
        setStatus(undefined);
        setRequiresAuth(false);
        return;
      }
      await signTx();
    },
    [requiresAuth, password, ledger]
  );

  useEffect(() => {
    client
      ?.requiresAuth()
      .then((isAuthRequired) => setRequiresAuth(isAuthRequired))
      .catch((e) => console.error(e));
    client
      ?.queryLedgerSignTx(msgId)
      .then(setLedger)
      .catch((e: unknown) => {
        setError(`${e}`);
        setStatus(Status.Failed);
      });
  }, []);

  useEffect(() => {
    // User is authenticated with a valid session, so submit signed Tx:
    if (requiresAuth === false && ledger === null) void signTx();
  }, [requiresAuth, ledger]);

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
        {!requiresAuth &&
          ledger &&
          (ledgerStep ?
            <LedgerProgress
              steps={["connect", "unlock", "open-app", "sign"]}
              current={ledgerStep}
              error={status === Status.Failed ? error : undefined}
              onCancel={cancelLedger}
              onRetry={() => void signOnLedger()}
            />
          : <ActionButton
              size="lg"
              backgroundHoverColor="black"
              textHoverColor="primary"
              onClick={() => void signOnLedger()}
            >
              Sign with Ledger
            </ActionButton>)}
        {!requiresAuth &&
          !ledger &&
          (status === Status.Failed ?
            <Alert type="error">{error}</Alert>
          : <Alert type="warning">Submitting signature</Alert>)}
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
