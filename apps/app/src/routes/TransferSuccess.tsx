import type { ComponentProps } from "react";
import { TransactionReceiptCard } from "../components/TransactionReceiptCard";

export function TransferSuccess({
  tx,
}: ComponentProps<typeof TransactionReceiptCard>) {
  return (
    <>
      <div className="px-10 mt-15">
        <div className="px-2 py-5 border border-gray-300 bg-white max-w-125 mx-auto rounded-2xl text-center font-medium">
          Transaction submitted
          <div>This transaction is awaiting network confirmation.</div>
        </div>
      </div>
      <TransactionReceiptCard tx={tx} />
    </>
  );
}
