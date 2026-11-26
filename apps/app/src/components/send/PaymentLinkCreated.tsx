import { useBlocker } from "@tanstack/react-router";
import { useEffect, useId, type ReactNode } from "react";
import { GoAlert, GoCheck } from "react-icons/go";
import QRCode from "react-qr-code";
import { twMerge } from "tailwind-merge";
import { useGetTransactionHistory } from "../../hooks/useGetTransactionHistory";
import {
  usePendingProgress,
  type PendingTx,
} from "../../hooks/usePendingProgress";
import { SpinnerIcon } from "../../icons/SpinnerIcon";
import { zatoshiToZec } from "../../lib/utils";
import { CopyToClipboardControl } from "../CopyToClipboardControl";
import { FormPage } from "../FormPage";
import { ActionButton } from "../ui/ActionButton";
import { qrClassName } from "../ui/utils";

type Props = {
  url: string;
  amount: bigint;
  description: string;
  /** The funding, once broadcast. */
  tx?: PendingTx;
  /** Why the funding failed before it was broadcast. */
  error?: Error | null;
};

/**
 * The link, shown as soon as the Keychain approves its funding, while that
 * funding is still proved, broadcast and mined. Whoever opens it early sees
 * the money on its way.
 */
export function PaymentLinkCreated({
  tx,
  url,
  amount,
  description,
  error,
}: Props) {
  // The history entry moves from Pending to Confirmed, or Expired, as sync runs.
  const funding = useGetTransactionHistory().data?.find(
    (t) => t.txid === tx?.txid,
  );
  // Leaving before the broadcast drops the funding.
  const sending = !tx && !error;
  useLeaveWarning(sending);
  const leaving = useBlocker({
    shouldBlockFn: () => sending,
    enableBeforeUnload: false,
    withResolver: true,
  });
  const zec = `${zatoshiToZec(amount)} ZEC`;

  if (error || funding?.status === "Expired") {
    return (
      <FormPage title="Link not created">
        <div
          role="alert"
          className="px-5 py-4 flex items-start gap-3 rounded-lg bg-red-700/10"
        >
          <GoAlert
            aria-hidden="true"
            className="size-4 shrink-0 mt-0.5 text-red-700"
          />
          <div className="flex flex-col gap-1">
            <p className="text-sm">
              {error
                ? "The payment into the link failed"
                : "The network didn't take the payment into the link in time"}
              , so the link holds nothing and the {zec} stayed in your wallet.
              Don't share it; create a new link.
            </p>
            {error && <p className="text-xs text-gray-600">{error.message}</p>}
          </div>
        </div>
      </FormPage>
    );
  }

  const confirmed = funding?.status === "Confirmed";
  const step = confirmed ? 3 : tx ? 2 : 1;
  return (
    <FormPage title={confirmed ? "Payment link ready" : "Payment link created"}>
      <p className="-mt-2 text-center text-3xl font-semibold tracking-tight">
        {zec}
      </p>
      <Steps step={step} />
      <p role="status" className="-mt-1 mb-4 text-center text-xs text-gray-600">
        {confirmed ? (
          "In the link and ready to claim."
        ) : tx ? (
          <Confirming tx={funding ?? tx} />
        ) : (
          "The Keychain is making this payment's proof. Keep this page open until it's sent."
        )}
      </p>
      <LinkShare url={url} description={description} />
      {leaving.status === "blocked" && (
        <LeaveDialog onStay={leaving.reset} onLeave={leaving.proceed} />
      )}
    </FormPage>
  );
}

/** Asked when the user navigates away while the funding is still being proved. */
function LeaveDialog({
  onStay,
  onLeave,
}: {
  onStay: () => void;
  onLeave: () => void;
}) {
  const titleId = useId();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-6">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-90 flex flex-col gap-3 rounded-2xl bg-surface p-6 text-center"
      >
        <h2 id={titleId} className="text-base font-semibold">
          Leave before it's sent?
        </h2>
        <p className="text-sm text-gray-600">
          The Keychain is still making the proof for this payment, which can
          take a little while. If you leave now, nothing is sent and the link
          stays empty.
        </p>
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onLeave}
            className="px-4 py-2 rounded-full text-sm font-medium text-gray-600 transition-colors duration-300 hover:bg-black/5"
          >
            Leave anyway
          </button>
          <ActionButton
            type="button"
            size="sm"
            outlineColor="black"
            autoFocus
            onClick={onStay}
          >
            Stay
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

function Confirming({ tx }: { tx: PendingTx }) {
  const { detail } = usePendingProgress(tx);
  return <>Sent. Waiting for the network to confirm it · {detail}</>;
}

const STEPS = ["Approved", "Sent", "Confirmed"];

/** Where the funding is: approved, broadcast, then mined. `step` is how many are reached, the last one in progress. */
function Steps({ step }: { step: number }) {
  return (
    <ol className="mx-auto w-full max-w-80 grid grid-cols-3 pt-2">
      {STEPS.map((label, i) => {
        const done = i < step - 1 || step === STEPS.length;
        const active = i === step - 1 && !done;
        return (
          <li
            key={label}
            aria-current={active ? "step" : undefined}
            className="relative flex flex-col items-center gap-2"
          >
            {i > 0 && (
              <span
                aria-hidden="true"
                className={twMerge(
                  "absolute top-2.5 right-1/2 w-full h-px bg-line",
                  i < step && "bg-gold",
                )}
              />
            )}
            <span
              className={twMerge(
                "relative z-10 size-5 grid place-items-center rounded-full bg-surface",
                done && "bg-gold text-white",
                !done && !active && "border border-line",
              )}
            >
              {done ? (
                <GoCheck aria-hidden="true" className="size-3" />
              ) : active ? (
                <SpinnerIcon aria-hidden="true" className="size-5 text-gold" />
              ) : null}
            </span>
            <span
              className={twMerge(
                "text-xs",
                done || active ? "font-medium" : "text-gray-600",
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** A link to hand on: its QR code, Copy, Share, and what holding it means. */
export function LinkShare({
  url,
  description,
}: {
  url: string;
  description?: string;
}) {
  const canShare = typeof navigator.share === "function";

  return (
    <>
      <section
        aria-label="Your payment link"
        className="flex flex-col items-center gap-4"
      >
        <div className="w-fit flex flex-col items-center gap-3 rounded-2xl bg-card p-5 pb-4">
          <QRCode
            size={208}
            value={url}
            bgColor="transparent"
            fgColor="#000000"
            level="M"
            title="QR code of the payment link"
            className={qrClassName}
          />
          {description && (
            <p className="max-w-52 text-center text-sm text-neutral-700 break-words">
              {description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <CopyToClipboardControl
            value={url}
            className="gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors duration-300 hover:bg-gold/15"
            iconClassName="size-4"
          >
            Copy link
          </CopyToClipboardControl>
          {canShare && (
            <ActionButton
              type="button"
              size="sm"
              outlineColor="black"
              onClick={() => {
                // Closing the share sheet rejects; there's nothing to report.
                navigator.share({ url }).catch(() => {});
              }}
            >
              Share
            </ActionButton>
          )}
        </div>
      </section>

      <Note>
        The link is cash: anyone who has it can claim the money. Share it
        privately; chat previews, screenshots and QR codes all count as sharing.
        Copy it before leaving this page.
      </Note>
    </>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p role="note" className="px-2 text-center text-xs text-neutral-500">
      {children}
    </p>
  );
}

/** Asks before closing the tab while `active`; browsers show only their own text there. */
function useLeaveWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
}
