/**
 * Final sign confirmation: re-verifies the password when the 30-minute auth
 * window expired, then submits the approved sign request (the background
 * decrypts the seed and signs the PCZT) and closes. A Ledger account's PCZT
 * is signed on the device from here instead, as WebHID needs a page, and the
 * background puts the device's signatures in.
 */
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { CgSpinner } from "react-icons/cg";
import { useNavigate } from "react-router-dom";

import {
  initZillionsSdk,
  ledgerTransaction,
} from "../../background/crypto/zillions";
import type { LedgerSignTx } from "../../ipc/contract";
import { ActionBar, Button } from "../../popup/ui/Button";
import { Notice } from "../../popup/ui/Notice";
import { PasswordField } from "../../popup/ui/PasswordField";
import { ScreenHeader } from "../../popup/ui/ScreenHeader";
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
      const signatures = await withLedger(
        setLedgerStep,
        async (device) => {
          await initZillionsSdk();
          const transaction = ledgerTransaction(ledger.pczt, ledger.hdIndex);
          return signLedgerPczt(device, transaction, setLedgerStep);
        },
        signal,
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

      if (ledger) {
        setStatus(undefined);
        setRequiresAuth(false);
        return;
      }
      await signTx();
    },
    [requiresAuth, password, ledger],
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
    if (requiresAuth !== false || ledger === undefined) return;
    if (ledger) void signOnLedger();
    else void signTx();
  }, [requiresAuth, ledger]);

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
      {!requiresAuth && ledger && (
        <div className="mt-3.5">
          <LedgerProgress
            steps={["connect", "unlock", "open-app", "sign"]}
            current={ledgerStep ?? "connect"}
            error={status === Status.Failed ? error : undefined}
            onCancel={() => void cancelLedger()}
            onRetry={() => void signOnLedger()}
          />
        </div>
      )}
      {!requiresAuth &&
        !ledger &&
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
