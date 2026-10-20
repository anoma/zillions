import type { ComponentProps } from "react";
import { SpinnerIcon } from "../icons/SpinnerIcon";
import { TransactionReceiptCard } from "./TransactionReceiptCard";

export function TransferSuccess({
  tx,
}: ComponentProps<typeof TransactionReceiptCard>) {
  return (
    <>
      <div className="px-10 max-sm:px-6 mt-10">
        <div
          role="status"
          className="max-w-150 mx-auto px-5 py-4 flex items-center gap-3 rounded-lg bg-gold/15"
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
    </>
  );
}
