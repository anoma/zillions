import { Link } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";
import { useGetTransactionHistory } from "../hooks/useGetTransactionHistory";
import type { Activity } from "../lib/wallet/types";
import { AddressBadge } from "./AddressBadge";
import { PageError } from "./PageError";
import { PageLoader } from "./PageLoader";
import { PendingStatus, TransactionTypeIcon } from "./TransactionTypeAndStatus";
import { TransactionValue } from "./TransactionValue";
import { focusRingClassName } from "./ui/utils";

// icon | type over time | amount; desktops add the From → To route before the
// amount. The list owns the columns and each row subgrids into them, so every
// route starts at the same place.
const gridClassName =
  "grid gap-x-4 grid-cols-[auto_1fr_auto] lg:grid-cols-[auto_minmax(8rem,1fr)_minmax(0,2fr)_auto]";
const rowClassName = "col-span-full grid grid-cols-subgrid items-center";
const routeClassName = "max-lg:hidden";

/**
 * The transaction list. As a page it's the full history under its own title;
 * as a section (`limit`) it's the latest few with a link to the rest.
 */
export function TransactionHistory({
  title,
  limit,
}: {
  title: string;
  limit?: number;
}) {
  const transactionHistory = useGetTransactionHistory();

  if (transactionHistory.isPending) {
    return <PageLoader />;
  }

  if (!transactionHistory.isSuccess) {
    return <PageError>{String(transactionHistory.error)}</PageError>;
  }

  const all = transactionHistory.data;
  const shown = limit ? all.slice(0, limit) : all;

  return (
    <section
      aria-labelledby="transactions-title"
      className={twMerge(
        "p-10 max-sm:px-6 overflow-auto",
        limit ? "pt-10" : "pt-8",
      )}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2
          id="transactions-title"
          className={twMerge(
            "font-semibold tracking-tight",
            limit ? "text-base" : "text-2xl",
          )}
        >
          {title}
        </h2>
        {limit && all.length > limit && (
          <Link
            to="/transactions"
            className={twMerge(
              "text-sm font-medium rounded-sm underline decoration-transparent underline-offset-4 transition-colors duration-300 hover:decoration-current",
              focusRingClassName,
            )}
          >
            See all
          </Link>
        )}
      </div>
      {/* Rows bleed past the title by their padding, so their text lines up with it. */}
      <div
        className={twMerge(
          gridClassName,
          "-mx-4 divide-y divide-line font-medium text-sm",
          limit ? "mt-4" : "mt-6",
        )}
      >
        {shown.length === 0 && (
          <p className="col-span-full px-4 py-10 text-center text-gray-600">
            No transactions yet
          </p>
        )}
        {shown.map((tx) => (
          <Row key={tx.txid} tx={tx} />
        ))}
      </div>
    </section>
  );
}

function Row({ tx }: { tx: Activity }) {
  return (
    <Link
      to="/tx/$id"
      params={{ id: tx.txid }}
      className={twMerge(
        rowClassName,
        "py-4 px-4 transition-colors duration-300 hover:bg-card",
        "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-black",
      )}
    >
      <span className="size-9 grid place-items-center rounded-full bg-black/5 text-gray-600">
        <TransactionTypeIcon tx_type={tx.tx_type} />
      </span>
      <div>
        <div>{tx.tx_type}</div>
        <div className="mt-0.5 text-xs text-gray-600">
          <When tx={tx} />
        </div>
      </div>
      <div
        className={twMerge(
          "min-w-0 flex items-center gap-3 text-gray-600",
          routeClassName,
        )}
      >
        <AddressBadge party={tx.from} />
        <span aria-hidden="true" className="text-black/30">
          →
        </span>
        <AddressBadge party={tx.to} />
      </div>
      <div className="text-right text-base font-semibold">
        <TransactionValue tx={tx} className="proportional-nums" />
      </div>
    </Link>
  );
}

function When({ tx }: { tx: Activity }) {
  if (tx.status === "Pending") return <PendingStatus tx={tx} />;
  if (!tx.timestamp) return null;
  return (
    <time>
      {new Date(Number(tx.timestamp) * 1000).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}
    </time>
  );
}
