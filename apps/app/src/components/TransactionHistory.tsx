import { Link } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";
import { useGetTransactionHistory } from "../hooks/useGetTransactionHistory";
import { ArrowDownIcon } from "../icons/ArrowDownIcon";
import { ArrowUpIcon } from "../icons/ArrowUpIcon";
import { ShieldCheckIcon } from "../icons/ShieldCheckIcon";
import { ShieldSlashIcon } from "../icons/ShieldSlashIcon";
import { zatoshiToZec } from "../lib/utils";
import { AddressBadge } from "./AddressBadge";
import { PageError } from "./PageError";
import { PageLoader } from "./PageLoader";

export function TransactionHistory() {
  const transactionHistory = useGetTransactionHistory();

  if (transactionHistory.isPending) {
    return <PageLoader />;
  }

  if (!transactionHistory.isSuccess) {
    return <PageError>{String(transactionHistory.error)}</PageError>;
  }

  const gridClassName = "grid gap-2 lg:grid-cols-5 lg:*:last:text-right";

  return (
    <div className="p-10 overflow-auto">
      <div className="font-medium">Transactions</div>
      <div className="lg:mt-10 font-medium text-sm">
        <div className={twMerge("max-lg:hidden", gridClassName)}>
          <div>Type</div>
          <div>Value</div>
          <div>From</div>
          <div>To</div>
          <div>Time</div>
        </div>
        <div className="mt-5 space-y-0">
          {transactionHistory.data.map((item) => (
            <Link
              key={item.txid}
              to={"/tx/$id"}
              params={{ id: item.txid }}
              className={twMerge(
                "py-3 -mx-5 px-5 hover:bg-white transition-all",
                "rounded-2xl lg:rounded-full hover:bg-white transition-all",
                gridClassName,
              )}
            >
              <div className="flex items-center gap-2">
                {item.tx_type === "Sent" ? (
                  <ArrowUpIcon className="size-4" />
                ) : item.tx_type === "Received" ? (
                  <ArrowDownIcon className="size-4" />
                ) : item.tx_type === "Shielded" ? (
                  <ShieldCheckIcon className="size-4" />
                ) : item.tx_type === "Unshielded" ? (
                  <ShieldSlashIcon className="size-4" />
                ) : (
                  <div />
                )}
                {item.tx_type}
                {item.status !== "Confirmed" && ` (${item.status})`}
              </div>
              <div>
                {zatoshiToZec(
                  item.value +
                    (item.tx_type === "Shielded" || item.tx_type === "Migrated"
                      ? item.fee
                      : 0n),
                )}{" "}
                ZEC
              </div>
              <AddressBadge address={item.from_address} />
              <AddressBadge address={item.to_address} />
              <time>
                {item.timestamp &&
                  new Date(Number(item.timestamp) * 1000).toLocaleString(
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
