import { twMerge } from "tailwind-merge";
import { ExternalLinkIcon } from "../icons/ExternalLinkIcon";
import { fitFontSize, transactionValue, zatoshiToZec } from "../lib/utils";
import type { Activity } from "../lib/wallet/types";
import { AddressBadge } from "./AddressBadge";
import { CopyToClipboardControl } from "./CopyToClipboardControl";
import { PageShell } from "./PageShell";
import { FeeRow, TotalRow } from "./PlannedFee";
import { TransactionTypeAndStatus } from "./TransactionTypeAndStatus";
import { TransactionValue } from "./TransactionValue";
import { cardClassName, sectionLabelClassName } from "./ui/utils";

const explorerUrl = (txid: string) =>
  `https://blockchair.com/zcash/transaction/${txid}`;

export type TransactionReceiptCardProps = {
  tx: Pick<
    Activity,
    | "txid"
    | "tx_type"
    | "value"
    | "fee"
    | "status"
    | "timestamp"
    | "from"
    | "to"
  > & { memo?: string };
};

export function TransactionReceiptCard({ tx }: TransactionReceiptCardProps) {
  const { signal, value } = transactionValue(tx);
  // +2 for the half-size " ZEC" suffix.
  const valueChars = signal.length + zatoshiToZec(value).length + 2;
  // The last row is what the whole transaction comes to.
  const rows = (
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
      Migrated: [
        ["Moved", tx.value],
        ["Transaction fee", tx.fee],
        ["Total spent", tx.value + tx.fee],
      ],
    } as const
  )[tx.tx_type];
  const total = rows.at(-1);
  // Until its block is fetched, a shielded transaction has only a placeholder id.
  const onExplorer = /^[0-9a-f]{64}$/.test(tx.txid);

  return (
    <PageShell title="Transaction receipt">
      <div className="@container mt-8 flex flex-col gap-5">
        <section
          aria-label="Transaction"
          className={twMerge(cardClassName, "items-center gap-2 text-center")}
        >
          <div className="text-sm font-medium">
            <TransactionTypeAndStatus tx={tx} />
          </div>
          <div
            className="py-3 leading-none font-medium"
            style={{ fontSize: fitFontSize(valueChars, "3.75rem") }}
          >
            <TransactionValue tx={tx} />
          </div>
          {tx.timestamp && (
            <time className="text-xs text-gray-600">
              {new Date(Number(tx.timestamp) * 1000).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </time>
          )}
          <p className="mt-3 w-full grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <span className="sr-only">From</span>
            <AddressBadge
              party={tx.from}
              copyable
              className="h-9 justify-center"
            />
            <span className="sr-only">to</span>
            <span aria-hidden="true" className="text-black/50">
              →
            </span>
            <AddressBadge
              party={tx.to}
              copyable
              className="h-9 justify-center"
            />
          </p>
        </section>

        {total && (
          <section
            aria-labelledby="receipt-summary"
            className={twMerge(cardClassName, "gap-0 [&>div]:mt-2")}
          >
            <h2
              id="receipt-summary"
              className={twMerge(sectionLabelClassName, "mb-1")}
            >
              Summary
            </h2>
            {rows.slice(0, -1).map(([label, zat]) => (
              <FeeRow key={label} label={label} fee={zat} pending={false} />
            ))}
            <TotalRow label={total[0]} value={total[1]} />
          </section>
        )}

        <section
          aria-labelledby="receipt-details"
          className={twMerge(cardClassName, "gap-3")}
        >
          <h2 id="receipt-details" className={sectionLabelClassName}>
            Details
          </h2>
          {tx.memo && (
            <CopyToClipboardControl
              value={tx.memo}
              className="justify-between gap-4 px-4 py-3 rounded-xl border border-line bg-white transition-colors duration-300 hover:border-line-strong"
            >
              <span className="text-xs font-medium">
                <span className="block text-gray-600">Message</span>
                <span className="block mt-0.5 font-normal whitespace-pre-wrap wrap-anywhere">
                  {tx.memo}
                </span>
              </span>
            </CopyToClipboardControl>
          )}
          <CopyToClipboardControl
            value={tx.txid}
            className="justify-between gap-4 px-4 py-3 rounded-xl border border-line bg-white transition-colors duration-300 hover:border-line-strong"
          >
            <span className="text-xs font-medium">
              <span className="block text-gray-600">Transaction hash</span>
              <span className="block mt-0.5 tracking-tight wrap-anywhere">
                {tx.txid}
              </span>
            </span>
          </CopyToClipboardControl>
          {onExplorer && (
            <a
              href={explorerUrl(tx.txid)}
              target="_blank"
              rel="noopener noreferrer"
              className="self-center inline-flex items-center gap-1 text-xs font-medium rounded-sm underline decoration-transparent underline-offset-2 transition-colors duration-300 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
            >
              View on explorer
              <ExternalLinkIcon aria-hidden="true" className="size-3" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
        </section>
      </div>
    </PageShell>
  );
}
