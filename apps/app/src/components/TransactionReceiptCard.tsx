import { useNow } from "../hooks/useNow";
import { ExternalLinkIcon } from "../icons/ExternalLinkIcon";
import { fitFontSize, transactionValue, zatoshiToZec } from "../lib/utils";
import { minutesLeft, PROCESSING_ESTIMATE_MIN } from "../lib/wallet/pending";
import type { Activity, Party } from "../lib/wallet/types";
import { AddressBadge } from "./AddressBadge";
import { CopyToClipboardControl } from "./CopyToClipboardControl";
import { PageShell } from "./PageShell";
import { TransactionTypeAndStatus } from "./TransactionTypeAndStatus";
import { TransactionValue } from "./TransactionValue";
import { ZecValue } from "./ZecValue";

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
    | "self"
  > &
    Partial<Pick<Activity, "confirmations" | "expires_in">> & {
      memo?: string;
    };
};

/** Minutes left of the usual wait for a transaction still processing, or that it's late. */
function ProcessingHint({
  timestamp,
  expires_in,
}: Pick<Activity, "timestamp" | "expires_in">) {
  const now = useNow(10_000);
  const left =
    timestamp === undefined ? undefined : minutesLeft(timestamp, now);
  return (
    <div className="mt-2 text-center text-xs text-neutral-500">
      {left === 0
        ? `Taking longer than usual${expires_in !== undefined ? ` · expires in ${expires_in} blocks` : ""}`
        : left === undefined
          ? `Usually takes about ${PROCESSING_ESTIMATE_MIN} minutes`
          : `About ${left} min left`}
    </div>
  );
}

/** Every address on a side that has several, each recipient with what it got. */
function PartyList({ label, party }: { label: string; party: Party }) {
  if (!("address" in party) || !party.more) return null;
  return (
    <div className="mt-5 rounded-lg border border-gray-300 p-3 text-xs font-medium">
      <div>{label}:</div>
      {[party, ...party.more].map(({ address, value }) => (
        <div
          key={address}
          className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2"
        >
          <CopyToClipboardControl
            value={address}
            className="justify-between gap-2"
          >
            <span className="font-normal tracking-tight wrap-anywhere">
              {address}
            </span>
          </CopyToClipboardControl>
          {value !== undefined && <ZecValue zat={value} />}
        </div>
      ))}
    </div>
  );
}

export function TransactionReceiptCard({ tx }: TransactionReceiptCardProps) {
  const { signal, value } = transactionValue(tx);
  // +2 for the half-size " ZEC" suffix.
  const valueChars = signal.length + zatoshiToZec(value).length + 2;
  return (
    <PageShell title="Transaction receipt">
      <div className="mt-1 text-center text-xs">
        {tx.timestamp && (
          <time>{new Date(Number(tx.timestamp) * 1000).toLocaleString()}</time>
        )}
      </div>

      <div className="@container max-w-125 mx-auto">
        <div className="mt-15 mx-auto w-fit">
          <TransactionTypeAndStatus tx={tx} />
        </div>
        {tx.status === "Pending" && !tx.confirmations && (
          <ProcessingHint timestamp={tx.timestamp} expires_in={tx.expires_in} />
        )}

        <div
          className="mt-2 text-center leading-none font-medium"
          style={{ fontSize: fitFontSize(valueChars, "3.75rem") }}
        >
          <TransactionValue tx={tx} />
        </div>

        <div className="mt-15 flex items-center justify-center gap-2">
          <AddressBadge party={tx.from} copyable className="h-8 w-50 text-sm" />{" "}
          → <AddressBadge party={tx.to} copyable className="h-8 w-50 text-sm" />
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
              Migrated: [
                ["Moved", tx.value],
                ["Transaction fee", tx.fee],
                ["Total spent", tx.value + tx.fee],
              ],
            } as const
          )[tx.tx_type].map(([label, value]) => (
            <div
              key={label}
              className="grid grid-cols-2 gap-2 text-xs font-medium mb-2"
            >
              <div>{label}</div>
              <ZecValue zat={value} className="text-right" />
            </div>
          ))}
        </div>

        <PartyList label="Senders" party={tx.from} />
        <PartyList label="Recipients" party={tx.to} />

        {tx.memo && (
          <div className="mt-5 rounded-lg border border-gray-300">
            <CopyToClipboardControl
              value={tx.memo}
              className="w-full justify-between p-3"
            >
              <div className="text-xs font-medium">
                <div>Message:</div>
                <div className="font-normal whitespace-pre-wrap wrap-anywhere">
                  {tx.memo}
                </div>
              </div>
            </CopyToClipboardControl>
          </div>
        )}

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

        {/* Until its block is fetched, a shielded transaction has only a placeholder id. */}
        {/^[0-9a-f]{64}$/.test(tx.txid) && (
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
        )}
      </div>
    </PageShell>
  );
}
