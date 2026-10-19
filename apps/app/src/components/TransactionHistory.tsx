import { Link } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";
import { useGetTransactionHistory } from "../hooks/useGetTransactionHistory";
import { AddressBadge } from "./AddressBadge";
import { PageError } from "./PageError";
import { PageLoader } from "./PageLoader";
import {
  PendingStatus,
  TransactionTypeAndStatus,
  TransactionTypeIcon,
} from "./TransactionTypeAndStatus";
import { TransactionValue } from "./TransactionValue";

export function TransactionHistory() {
  const transactionHistory = useGetTransactionHistory();

  if (transactionHistory.isPending) {
    return <PageLoader />;
  }

  if (!transactionHistory.isSuccess) {
    return <PageError>{String(transactionHistory.error)}</PageError>;
  }

  const gridClassName =
    "grid items-center gap-x-3 sm:gap-x-2 grid-cols-[auto_1fr_auto] sm:grid-cols-3 lg:grid-cols-5 sm:*:last:text-right sm:*:last:justify-end";
  const fromToClassName = "max-lg:hidden";

  return (
    <div className="p-10 max-sm:px-6 overflow-auto">
      <div className="font-medium">Transactions</div>
      <div className="sm:mt-10 font-medium text-sm">
        <div className={twMerge("max-sm:hidden", gridClassName)}>
          <div>Type</div>
          <div>Value</div>
          <div className={fromToClassName}>From</div>
          <div className={fromToClassName}>To</div>
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
                "rounded-2xl sm:rounded-full hover:bg-white transition-all",
                gridClassName,
              )}
            >
              <TransactionTypeIcon
                tx_type={tx.tx_type}
                className="size-6 row-span-2 sm:hidden"
              />
              <TransactionTypeAndStatus
                tx={{ tx_type: tx.tx_type }}
                iconClassName="max-sm:hidden"
              />
              <div className="max-sm:row-span-2 max-sm:text-right">
                <TransactionValue tx={tx} />
              </div>
              <AddressBadge
                party={tx.from}
                className={twMerge("w-full max-w-35", fromToClassName)}
              />
              <AddressBadge
                party={tx.to}
                className={twMerge("w-full max-w-35", fromToClassName)}
              />
              <div className="flex items-center max-sm:col-start-2 max-sm:text-xs max-sm:text-neutral-500">
                {tx.status === "Pending" ? (
                  <PendingStatus tx={tx} />
                ) : (
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
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
