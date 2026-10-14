import type { ComponentProps } from "react";
import { TransactionReceiptCard } from "./TransactionReceiptCard";

export function TransferSuccess({
  tx,
}: ComponentProps<typeof TransactionReceiptCard>) {
  return (
    <>
      <div className="px-10 max-sm:px-6 mt-15">
        <div className="px-2 py-5 border border-gray-300 bg-white max-w-125 mx-auto rounded-2xl text-center">
          <div className="font-semibold">Transaction submitted</div>
          <div className="text-xs">
            This transaction is awaiting network confirmation.
          </div>
        </div>
      </div>
      <TransactionReceiptCard tx={tx} />
    </>
  );
}
