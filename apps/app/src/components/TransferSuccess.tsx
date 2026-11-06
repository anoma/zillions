import type { ComponentProps, ReactNode } from "react";
import { GoCheckCircle } from "react-icons/go";
import { useGetTransactionHistory } from "../hooks/useGetTransactionHistory";
import { usePendingProgress } from "../hooks/usePendingProgress";
import { SpinnerIcon } from "../icons/SpinnerIcon";
import { TransactionReceiptCard } from "./TransactionReceiptCard";

/** `tx`'s receipt, followed in history until it's mined; `children` go under it. */
export function TransferSuccess({
  tx,
  children,
}: ComponentProps<typeof TransactionReceiptCard> & { children?: ReactNode }) {
  const { detail } = usePendingProgress(tx);
  const mined = useGetTransactionHistory().data?.some(
    (h) => h.txid === tx.txid && h.status === "Confirmed",
  );
  return (
    <>
      <div className="px-10 max-sm:px-6 mt-10">
        <div
          role="status"
          className="max-w-120 mx-auto px-5 py-4 flex items-center gap-3 rounded-lg bg-gold/15"
        >
          {mined ? (
            <>
              <GoCheckCircle
                aria-hidden="true"
                className="size-4 shrink-0 text-gold"
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
                <div className="text-sm font-semibold">
                  Transaction submitted
                </div>
                <div className="text-xs text-gray-600">
                  Processing · {detail}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <TransactionReceiptCard
        tx={mined ? { ...tx, status: "Confirmed" } : tx}
      />
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
