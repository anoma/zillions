import { createFileRoute, notFound, useParams } from "@tanstack/react-router";
import { AddressBadge } from "../components/AddressBadge";
import { CopyToClipboardControl } from "../components/CopyToClipboardControl";
import { PageError } from "../components/PageError";
import { PageLoader } from "../components/PageLoader";
import { TransactionTypeAndStatus } from "../components/TransactionTypeAndStatus";
import { TransactionValue } from "../components/TransactionValue";
import { ZecValue } from "../components/ZecValue";
import { useGetTransactionHistory } from "../hooks/useGetTransactionHistory";
import { ExternalLinkIcon } from "../icons/ExternalLinkIcon";

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

  const tx = transactionHistory.data.find((t) => t.txid === id);
  if (!tx) {
    throw notFound();
  }

  return (
    <div className="p-10">
      <h1 className="text-center text-lg font-bold">Transaction receipt</h1>
      <div className="mt-1 text-center text-xs">
        <time>
          {tx.timestamp &&
            new Date(Number(tx.timestamp) * 1000).toLocaleString()}
        </time>
      </div>

      <div className="max-w-125 mx-auto">
        <div className="mt-15 mx-auto w-fit">
          <TransactionTypeAndStatus tx={tx} />
        </div>

        <div className="mt-2 text-center text-6xl leading-none font-medium">
          <TransactionValue tx={tx} />
        </div>

        <div className="mt-15 flex items-center justify-center gap-2">
          <AddressBadge
            address={tx.from_address}
            className="h-8 w-50 text-sm"
          />{" "}
          →{" "}
          <AddressBadge address={tx.to_address} className="h-8 w-50 text-sm" />
        </div>

        <div className="mt-20">
          {(
            {
              Shielded: [
                ["Sent from Transparent", tx.value + tx.fee],
                ["Transaction fee", tx.fee],
                ["Received in Shielded", tx.value],
              ],
              Unshielded: [
                ["Received in Transparent", tx.value],
                ["Transaction fee", tx.fee],
                ["Deducted from Shielded", tx.value + tx.fee],
              ],
              Sent: [
                ["Recipient received", -tx.value],
                ["Transaction fee", tx.fee],
                ["Total spent", -tx.value + tx.fee],
              ],
              Received: [],
              Migrated: [],
            } as const
          )[tx.tx_type].map(([label, value]) => (
            <div className="grid grid-cols-2 gap-2 text-xs font-medium mb-2">
              <div>{label}</div>
              <ZecValue zat={value} className="text-right" />
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-lg border border-gray-300">
          <CopyToClipboardControl
            value={tx.txid}
            className="w-full justify-between p-3"
          >
            <div className="text-xs font-medium">
              <div>Transaction hash:</div>
              <div className="tracking-tight wrap-anywhere">{tx.txid}</div>
            </div>
          </CopyToClipboardControl>
        </div>

        <div className="mt-3 text-center">
          <a
            href={explorerUrl(tx.txid)}
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
    </div>
  );
}
