import { createFileRoute, notFound, useParams } from "@tanstack/react-router";
import { AddressBadge } from "../components/AddressBadge";
import { PageError } from "../components/PageError";
import { PageLoader } from "../components/PageLoader";
import { useGetTransactionHistory } from "../hooks/useGetTransactionHistory";
import { ArrowDownIcon } from "../icons/ArrowDownIcon";
import { ArrowUpIcon } from "../icons/ArrowUpIcon";
import { ExternalLinkIcon } from "../icons/ExternalLinkIcon";
import { ShieldCheckIcon } from "../icons/ShieldCheckIcon";
import { ShieldSlashIcon } from "../icons/ShieldSlashIcon";
import { zatoshiToZec } from "../lib/utils";

export const Route = createFileRoute("/tx/$id")({
  component: TransactionRoute,
});

const explorerUrl = (txid: string) =>
  `https://blockchair.com/zcash/transaction/${txid}`;

function TransactionRoute() {
  const { id } = useParams({ strict: false });

  const transactionHistory = useGetTransactionHistory();

  if (transactionHistory.isPending) {
    return <PageLoader />;
  }

  if (!transactionHistory.isSuccess) {
    return <PageError>{String(transactionHistory.error)}</PageError>;
  }

  const item = transactionHistory.data.find((t) => t.txid === id);
  if (!item) {
    throw notFound();
  }

  return (
    <div>
      <div>ID: {id}</div>
      <div>
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
            new Date(Number(item.timestamp) * 1000).toLocaleString(undefined, {
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
        </time>
      </div>
      <a
        href={explorerUrl(item.txid)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-end hover:underline"
        title="View on Explorer"
      >
        <time>
          {item.timestamp &&
            new Date(Number(item.timestamp) * 1000).toLocaleString(undefined, {
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
        </time>
        <ExternalLinkIcon className="size-3 ml-1" />
      </a>
    </div>
  );
}
