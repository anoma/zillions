import { createFileRoute, notFound, useParams } from "@tanstack/react-router";
import { AddressBadge } from "../components/AddressBadge";
import { CopyToClipboardControl } from "../components/CopyToClipboardControl";
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
    <div className="p-10 mx-auto">
      <h1 className="text-center text-lg font-bold">Transaction receipt</h1>
      <div className="mt-1 text-center text-xs">
        <time>
          {item.timestamp &&
            new Date(Number(item.timestamp) * 1000).toLocaleString()}
        </time>
      </div>

      <div className="mt-15 text-lg flex items-center justify-center gap-2">
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

      <div className="mt-2 text-center text-6xl leading-none font-medium">
        {zatoshiToZec(
          item.value +
            (item.tx_type === "Shielded" || item.tx_type === "Migrated"
              ? item.fee
              : 0n),
        )}{" "}
        ZEC
      </div>

      <div className="my-15 flex items-center justify-center gap-2">
        <AddressBadge
          address={item.from_address}
          className="h-8 w-50 text-sm"
        />{" "}
        →{" "}
        <AddressBadge address={item.to_address} className="h-8 w-50 text-sm" />
      </div>

      <div className="mt-15 w-min mx-auto">
        <div className="text-xs font-medium mb-1">Tx hash:</div>
        <div className="h-11 py-0.5 px-5 rounded-full border border-gray-300 flex items-center">
          <CopyToClipboardControl value={item.txid}>
            <div className="text-xs">{item.txid}</div>
          </CopyToClipboardControl>
        </div>
      </div>

      <div className="text-center mt-5">
        <a
          href={explorerUrl(item.txid)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-end text-xs hover:underline"
          title="View on Explorer"
        >
          View on Explorer
          <ExternalLinkIcon className="size-3 ml-1" />
        </a>
      </div>
    </div>
  );
}
