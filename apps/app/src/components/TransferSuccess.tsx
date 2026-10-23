import type { ComponentProps, ReactNode } from "react";
import { SpinnerIcon } from "../icons/SpinnerIcon";
import { TransactionReceiptCard } from "./TransactionReceiptCard";

/** `children` go under the receipt, e.g. a way back to where the user was. */
export function TransferSuccess({
  tx,
  children,
}: ComponentProps<typeof TransactionReceiptCard> & { children?: ReactNode }) {
  return (
    <>
      <div className="px-10 max-sm:px-6 mt-10">
        <div
          role="status"
          className="max-w-120 mx-auto px-5 py-4 flex items-center gap-3 rounded-lg bg-gold/15"
        >
          <SpinnerIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-gold"
          />
          <div>
            <div className="text-sm font-semibold">Transaction submitted</div>
            <div className="text-xs text-gray-600">
              Waiting for the network to confirm it.
            </div>
          </div>
        </div>
      </div>
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
