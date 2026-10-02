import { Link } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";
import { useGetTransactionHistory } from "../hooks/useGetTransactionHistory";
import { SpinnerIcon } from "../icons/SpinnerIcon";
import { AddressBadge } from "./AddressBadge";
import { PageError } from "./PageError";
import { PageLoader } from "./PageLoader";
import { TransactionTypeAndStatus } from "./TransactionTypeAndStatus";
import { TransactionValue } from "./TransactionValue";

export function TransactionHistory() {
  const transactionHistory = useGetTransactionHistory();

  if (transactionHistory.isPending) {
    return <PageLoader />;
  }

  if (!transactionHistory.isSuccess) {
    return <PageError>{String(transactionHistory.error)}</PageError>;
  }

  const gridClassName = "grid gap-2 lg:grid-cols-6 lg:*:last:text-right";

  return (
    <div className="p-10 overflow-auto">
      <div className="font-medium">Transactions</div>
      <div className="lg:mt-10 font-medium text-sm">
        <div className={twMerge("max-lg:hidden", gridClassName)}>
          <div>Type</div>
          <div>Value</div>
          <div>From</div>
          <div>To</div>
          <div>Status</div>
          <div>Time</div>
        </div>
        <div className="mt-5 space-y-0">
          {transactionHistory.data.map((tx) => (
            <Link
              key={tx.txid}
              to={"/tx/$id"}
              params={{ id: tx.txid }}
              className={twMerge(
                "py-3 -mx-5 px-5 hover:bg-white transition-all",
                "rounded-2xl lg:rounded-full hover:bg-white transition-all",
                gridClassName,
              )}
            >
              <TransactionTypeAndStatus tx={{ tx_type: tx.tx_type }} />
              <TransactionValue tx={tx} />
              <AddressBadge party={tx.from} className="w-full max-w-35" />
              <AddressBadge party={tx.to} className="w-full max-w-35" />
              {tx.status === "Pending" ? (
                <div className="flex items-center gap-2">
                  <SpinnerIcon className="size-4" />
                  Processing
                </div>
              ) : (
                <div>Completed</div>
              )}
              <time>
                {tx.timestamp &&
                  new Date(Number(tx.timestamp) * 1000).toLocaleString(
                    undefined,
                    {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  )}
              </time>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
