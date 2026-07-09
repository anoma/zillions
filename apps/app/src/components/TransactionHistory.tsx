import { twMerge } from "tailwind-merge";
import { useGetTransactionHistory } from "../hooks/useGetTransactionHistory";
import { ArrowDownIcon } from "../icons/ArrowDownIcon";
import { ArrowUpIcon } from "../icons/ArrowUpIcon";
import { ExternalLinkIcon } from "../icons/ExternalLinkIcon";
import { ShieldIcon } from "../icons/ShieldIcon";
import { shortenAddress, zatoshiToZec } from "../lib/utils";
import { PageError } from "./PageError";
import { PageLoader } from "./PageLoader";

// Blockchair has no testnet explorer, so the link is only meaningful on mainnet.
const isMainnet = (import.meta.env.VITE_ZCASH_NETWORK ?? "main") === "main";
const explorerUrl = (txid: string) =>
  `https://blockchair.com/zcash/transaction/${txid}`;

function AddressOrShieldedBadge({ address }: { address?: string }) {
  if (!address) {
    return <div className="bg-gold rounded-full w-fit px-5">Shielded</div>;
  }
  return <div title={address}>{shortenAddress(address)}</div>;
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
            <th>Explorer</th>
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
                  ) : item.tx_type === "Shield" ? (
                    <ShieldIcon className="size-4" />
                  ) : item.tx_type === "Unshield" ? (
                    <div>-</div>
                  ) : item.tx_type === "Shielded" ? (
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
                {item.timestamp &&
                  new Date(Number(item.timestamp) * 1000).toLocaleString()}
              </td>
              <td>
                {isMainnet ? (
                  <a
                    href={explorerUrl(item.txid)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-end"
                    title="View on Blockchair"
                  >
                    <ExternalLinkIcon className="size-4" />
                  </a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
