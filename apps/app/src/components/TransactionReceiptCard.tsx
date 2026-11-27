import { ExternalLinkIcon } from "../icons/ExternalLinkIcon";
import { CLAIM_FEE } from "../lib/paymentLink";
import { fitFontSize, transactionValue, zatoshiToZec } from "../lib/utils";
import type { PublicActivity } from "../lib/wallet/activity";
import type { Activity, Party } from "../lib/wallet/types";
import { AddressBadge } from "./AddressBadge";
import { CopyToClipboardControl } from "./CopyToClipboardControl";
import { FormPage } from "./FormPage";
import { FeeRow } from "./PlannedFee";
import { TransactionTypeAndStatus } from "./TransactionTypeAndStatus";
import { Breakdown, FormCard } from "./TransferForm";
import { ZecValue } from "./ZecValue";

const copyFieldClassName =
  "justify-between gap-4 px-4 py-3 rounded-lg border border-line bg-card transition-colors duration-300 hover:border-line-strong";

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
    | "link"
  > &
    Partial<Pick<Activity, "confirmations">> & {
      memo?: string;
    };
};

/** Every address on a side that has several, each recipient with what it got. */
function PartyList({ label, party }: { label: string; party: Party }) {
  if (!("address" in party) || !party.more) return null;
  return (
    <div className="px-4 py-3 rounded-lg border border-line bg-card text-xs font-medium">
      <div className="text-gray-600">{label}</div>
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

function TimeAndParties({
  tx,
}: {
  tx: Pick<Activity, "timestamp" | "from" | "to">;
}) {
  return (
    <>
      {tx.timestamp && (
        <time className="text-xs text-gray-600">
          {new Date(Number(tx.timestamp) * 1000).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </time>
      )}
      {/* An address pill doesn't fit half a phone-wide card: stack them there. */}
      <div className="@container mt-3 w-full">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 @max-md:grid-cols-1 @max-md:gap-1">
          <span className="sr-only">From</span>
          <AddressBadge party={tx.from} copyable pill />
          <span className="sr-only">to</span>
          <span aria-hidden="true" className="text-black/50 @max-md:rotate-90">
            →
          </span>
          <AddressBadge party={tx.to} copyable pill />
        </div>
      </div>
    </>
  );
}

function TxHash({ txid, onExplorer }: { txid: string; onExplorer: boolean }) {
  return (
    <>
      <CopyToClipboardControl value={txid} className={copyFieldClassName}>
        <span className="text-xs font-medium">
          <span className="block text-gray-600">Transaction hash</span>
          <span className="block mt-0.5 tracking-tight wrap-anywhere">
            {txid}
          </span>
        </span>
      </CopyToClipboardControl>
      {onExplorer && (
        <a
          href={explorerUrl(txid)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 self-center inline-flex items-center gap-1 text-xs font-medium rounded-sm underline decoration-transparent underline-offset-2 transition-colors duration-300 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
        >
          View on explorer
          <ExternalLinkIcon aria-hidden="true" className="size-3" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </>
  );
}

export function TransactionReceiptCard({ tx }: TransactionReceiptCardProps) {
  // Unsigned: the type above already says which way it went.
  const { value } = transactionValue(tx);
  // +2 for the half-size " ZEC" suffix.
  const valueChars = zatoshiToZec(value).length + 2;
  // The last row is what the whole transaction comes to.
  const rows = tx.link
    ? ([
        ["Link amount", -tx.value],
        ["Claim fee", CLAIM_FEE],
        ["Transaction fee", tx.fee],
        ["Total spent", -tx.value + CLAIM_FEE + tx.fee],
      ] as const)
    : (
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
          Prepared: [
            ["Split into standard amounts", tx.value],
            ["Transaction fee", tx.fee],
            ["Total spent", tx.value + tx.fee],
          ],
        } as const
      )[tx.tx_type];
  const total = rows.at(-1);
  // Until its block is fetched, a shielded transaction has only a placeholder id.
  const onExplorer = /^[0-9a-f]{64}$/.test(tx.txid);

  return (
    <FormPage title="Transaction receipt">
      <section
        aria-label="Transaction"
        className="@container flex flex-col items-center gap-2 text-center"
      >
        <div className="text-sm font-medium">
          <TransactionTypeAndStatus tx={tx} />
        </div>
        <div
          className="py-3 leading-none font-medium"
          style={{ fontSize: fitFontSize(valueChars, "3.75rem") }}
        >
          <ZecValue zat={value} />
        </div>
        <TimeAndParties tx={tx} />
      </section>

      {total && (
        <Breakdown label={total[0]} total={total[1]}>
          {rows.slice(0, -1).map(([label, zat]) => (
            <FeeRow key={label} label={label} fee={zat} pending={false} />
          ))}
        </Breakdown>
      )}

      <FormCard heading="Details" headingId="receipt-details">
        <PartyList label="Senders" party={tx.from} />
        <PartyList label="Recipients" party={tx.to} />
        {tx.memo && (
          <CopyToClipboardControl
            value={tx.memo}
            className={copyFieldClassName}
          >
            <span className="text-xs font-medium">
              <span className="block text-gray-600">Message</span>
              <span className="block mt-0.5 font-normal whitespace-pre-wrap wrap-anywhere">
                {tx.memo}
              </span>
            </span>
          </CopyToClipboardControl>
        )}
        <TxHash txid={tx.txid} onExplorer={onExplorer} />
      </FormCard>
    </FormPage>
  );
}

export function PublicReceiptCard({ tx }: { tx: PublicActivity }) {
  return (
    <FormPage title="Transaction receipt">
      <p className="px-4 py-3 rounded-lg border border-line bg-card text-xs text-center text-gray-600">
        This transaction isn't in your wallet. Only its public details are
        shown.
      </p>
      <section
        aria-label="Transaction"
        className="flex flex-col items-center gap-2 text-center"
      >
        {!tx.block_height && (
          <div className="text-sm font-medium">Processing</div>
        )}
        <TimeAndParties tx={tx} />
      </section>

      {tx.fee !== undefined && (
        <section
          aria-label="Summary"
          className="flex flex-col gap-1.5 px-4 pt-4 border-t border-line"
        >
          <FeeRow fee={tx.fee} pending={false} />
        </section>
      )}

      <FormCard heading="Details" headingId="receipt-details">
        <PartyList label="Senders" party={tx.from} />
        <PartyList label="Recipients" party={tx.to} />
        <TxHash txid={tx.txid} onExplorer />
      </FormCard>
    </FormPage>
  );
}
