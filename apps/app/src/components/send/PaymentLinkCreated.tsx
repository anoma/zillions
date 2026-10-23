import { useEffect, type ReactNode } from "react";
import { GoAlert } from "react-icons/go";
import QRCode from "react-qr-code";
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
  tx: PendingTx;
  url: string;
  amount: bigint;
  description: string;
};

/**
 * The link just funded, shown only once its funding is confirmed, so whoever
 * gets it can claim at once. Until then this page is its only copy.
 */
export function PaymentLinkCreated({ tx, url, amount, description }: Props) {
  // The history entry moves from Pending to Confirmed, or Expired, as sync runs.
  const funding = useGetTransactionHistory().data?.find(
    (t) => t.txid === tx.txid,
  );
  const status = funding?.status ?? "Pending";
  // Until "show again" exists, this page is the link's only copy.
  useLeaveWarning(status !== "Expired");
  const zec = `${zatoshiToZec(amount)} ZEC`;

  if (status === "Expired") {
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
          <p className="text-sm">
            The network didn't take the transaction in time, so the link holds
            nothing and the {zec} stayed in your wallet. Create a new link.
          </p>
        </div>
      </FormPage>
    );
  }
  if (status === "Pending") {
    return <Funding tx={funding ?? tx} zec={zec} />;
  }
  return <Created url={url} zec={zec} description={description} />;
}

function Funding({ tx, zec }: { tx: PendingTx; zec: string }) {
  const { percent, detail } = usePendingProgress(tx);

  return (
    <FormPage title="Creating payment link">
      <section
        role="status"
        aria-label="Creating the payment link"
        className="flex flex-col items-center gap-5 py-10 text-center"
      >
        <SpinnerIcon aria-hidden="true" className="size-6 text-gold" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">Moving {zec} into the link</p>
          <p className="text-xs text-gray-600">
            {detail ?? "Waiting for the network to confirm it."}
          </p>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="w-48 h-1 rounded-full bg-line overflow-hidden"
        >
          <div
            className="h-full bg-gold transition-[width] duration-1000 ease-linear"
            style={{ width: `${percent ?? 0}%` }}
          />
        </div>
      </section>
      <Note>
        Keep this page open: the link appears here once the money is in it, and
        this is the only place it's shown.
      </Note>
    </FormPage>
  );
}

function Created({
  url,
  zec,
  description,
}: {
  url: string;
  zec: string;
  description: string;
}) {
  return (
    <FormPage title="Payment link ready">
      <p className="text-center text-sm text-gray-600 -mt-2">
        {zec}, ready to claim
      </p>
      <LinkShare url={url} description={description} />
    </FormPage>
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
        <div className="w-fit flex flex-col items-center gap-3 rounded-xl border border-line bg-card p-4 pb-3">
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

/** Asks before closing the tab while `active`. */
function useLeaveWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
}
