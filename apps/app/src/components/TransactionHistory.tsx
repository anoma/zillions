import { twMerge } from "tailwind-merge";
import { useGetTransactionHistory } from "../hooks/useGetTransactionHistory";
import { ArrowDownIcon } from "../icons/ArrowDownIcon";
import { ArrowUpIcon } from "../icons/ArrowUpIcon";
import { ExternalLinkIcon } from "../icons/ExternalLinkIcon";
import { ShieldIcon } from "../icons/ShieldIcon";
import { isShieldedAddress, shortenAddress, zatoshiToZec } from "../lib/utils";
import { PageError } from "./PageError";
import { PageLoader } from "./PageLoader";

const explorerUrl = (txid: string) =>
  `https://blockchair.com/zcash/transaction/${txid}`;

function AddressOrShieldedBadge({ address }: { address?: string }) {
  const hasGoldBadge = !address || isShieldedAddress(address);
  return (
    <div
      title={address}
      className={twMerge(hasGoldBadge && "bg-gold rounded-full w-fit px-4")}
    >
      {address ? shortenAddress(address) : hasGoldBadge ? "Shielded" : "-"}
    </div>
  );
}

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
            <th>From</th>
            <th>To</th>
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
                  ) : item.tx_type === "Shielded" ? (
                    <ShieldIcon className="size-4" />
                  ) : item.tx_type === "Unshielded" ? (
                    <div>-</div>
                  ) : item.tx_type === "Migrated" ? (
                    <div>-</div>
                  ) : (
                    <div />
                  )}
                  {item.tx_type}
                </div>
              </td>
              <td>{zatoshiToZec(item.value)} ZEC</td>
              <td>
                <AddressOrShieldedBadge address={item.from_address} />
              </td>
              <td>
                <AddressOrShieldedBadge address={item.to_address} />
              </td>
              <td>{item.status}</td>
              <td>
                <a
                  href={explorerUrl(item.txid)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-end hover:underline"
                  title="View on Explorer"
                >
                  {item.timestamp &&
                    new Date(Number(item.timestamp) * 1000).toLocaleString()}
                  <ExternalLinkIcon className="size-3 ml-1" />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
