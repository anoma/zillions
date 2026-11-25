import { type ComponentProps, type ReactNode, useState } from "react";
import { GoCheckCircle } from "react-icons/go";
import { useGetTransactionHistory } from "../hooks/useGetTransactionHistory";
import {
  type PendingTx,
  usePendingProgress,
} from "../hooks/usePendingProgress";
import { SpinnerIcon } from "../icons/SpinnerIcon";
import { TransactionReceiptCard } from "./TransactionReceiptCard";

/** "Transaction submitted" with `tx`'s time left, followed in history until it's mined, then "Transaction completed". */
function SubmittedBanner({ tx }: { tx: PendingTx }) {
  const { detail } = usePendingProgress(tx);
  const mined = useGetTransactionHistory().data?.some(
    (h) => h.txid === tx.txid && h.status === "Confirmed",
  );
  return (
    <div className="px-10 max-sm:px-6 mt-10">
      <div
        role="status"
        className={`max-w-120 mx-auto px-5 py-4 flex items-center gap-3 rounded-lg transition-colors ${mined ? "bg-green/15" : "bg-gold/15"}`}
      >
        {mined ? (
          <>
            <GoCheckCircle
              aria-hidden="true"
              className="size-4 shrink-0 text-green"
            />
            <div className="text-sm font-semibold">Transaction completed</div>
          </>
        ) : (
          <>
            <SpinnerIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-gold"
            />
            <div>
              <div className="text-sm font-semibold">Transaction submitted</div>
              <div className="text-xs text-gray-600">Processing · {detail}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** `tx`'s receipt, with a banner that follows it until it's mined if it's pending as the page opens; `children` go under it. */
export function TransactionReceipt({
  tx,
  children,
}: ComponentProps<typeof TransactionReceiptCard> & { children?: ReactNode }) {
  const [followed] = useState(tx.status === "Pending");
  return (
    <>
      {followed && <SubmittedBanner tx={tx} />}
      <TransactionReceiptCard tx={tx} />
      {children && (
        <div className="px-8 pb-10 max-sm:px-6">
          <div className="isolate mx-auto max-w-120 flex flex-col">
            {children}
          </div>
        </div>
      )}
    </>
  );
}
