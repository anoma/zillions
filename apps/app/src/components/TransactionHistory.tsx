import { twMerge } from "tailwind-merge";
import { useGetTransactionHistory } from "../hooks/useGetTransactionHistory";
import { ArrowDownIcon } from "../icons/ArrowDownIcon";
import { ArrowUpIcon } from "../icons/ArrowUpIcon";
import { zatoshiToZec } from "../lib/utils";
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

  return (
    <div className="p-10 overflow-auto">
      <div className="font-medium">Transactions</div>
      <table
        className={twMerge(
          "w-full mt-10 font-medium text-sm",
          "[&_th,&_td]:text-left [&_th,&_td]:last:text-right [&_th,&_td]:py-1 lg:[&_th,&_td]:py-2",
          "max-lg:[&,&_tr,&_td]:block max-lg:[&_thead]:hidden",
        )}
      >
        <thead>
          <tr>
            <th>Type</th>
            <th>Value</th>
            <th>Status</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {transactionHistory.data.map((item) => (
            <tr key={item.txid} className="mb-10">
              <td>
                <div className="flex items-center gap-2">
                  {item.tx_type === "Sent" ? (
                    <ArrowUpIcon className="size-4" />
                  ) : item.tx_type === "Received" ? (
                    <ArrowDownIcon className="size-4" />
                  ) : (
                    <div />
                  )}
                  {item.tx_type}
                </div>
              </td>
              <td>{zatoshiToZec(item.value)} ZEC</td>
              <td>{item.status}</td>
              <td>
                {item.timestamp &&
                  new Date(Number(item.timestamp) * 1000).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
