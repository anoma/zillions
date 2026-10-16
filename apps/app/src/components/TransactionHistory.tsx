import { Link } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";
import { useGetTransactionHistory } from "../hooks/useGetTransactionHistory";
import { SpinnerIcon } from "../icons/SpinnerIcon";
import type { Activity } from "../lib/wallet/types";
import { AddressBadge } from "./AddressBadge";
import { PageError } from "./PageError";
import { PageLoader } from "./PageLoader";
import {
  TransactionTypeAndStatus,
  TransactionTypeIcon,
} from "./TransactionTypeAndStatus";
import { TransactionValue } from "./TransactionValue";
import { cardClassName, focusRingClassName } from "./ui/utils";

// Phones: icon | type over time | amount. Tablets: type | time | amount.
// Desktops add the From → To route between type and time.
const gridClassName =
  "grid items-center gap-x-3 grid-cols-[auto_1fr_auto] sm:grid-cols-[1fr_auto_auto] lg:grid-cols-[minmax(8rem,1fr)_minmax(0,2fr)_auto_auto]";
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
      className="p-10 max-sm:px-6 overflow-auto"
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
      <div
        className={twMerge(cardClassName, "mt-4 gap-0 p-2 font-medium text-sm")}
      >
        <div
          className={twMerge(
            "max-sm:hidden px-4 pt-2 pb-3 text-xs text-gray-600",
            gridClassName,
          )}
        >
          <div>Type</div>
          <div className={routeClassName}>From → To</div>
          <div>Time</div>
          <div className="text-right">Amount</div>
        </div>
        <div className="flex flex-col divide-y divide-line">
          {shown.length === 0 && (
            <p className="px-4 py-8 text-center text-gray-600">
              No transactions yet
            </p>
          )}
          {shown.map((tx) => (
            <Row key={tx.txid} tx={tx} />
          ))}
        </div>
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
        "py-3 px-4 -mx-0 rounded-2xl transition-colors duration-300 hover:bg-white",
        "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-black",
        gridClassName,
      )}
    >
      <TransactionTypeIcon
        tx_type={tx.tx_type}
        className="size-6 row-span-2 sm:hidden"
      />
      <TransactionTypeAndStatus
        tx={{ tx_type: tx.tx_type }}
        iconClassName="max-sm:hidden text-gray-600"
      />
      <div
        className={twMerge(
          "flex items-center gap-2 min-w-0 [&>*]:w-32 [&>*]:shrink",
          routeClassName,
        )}
      >
        <AddressBadge party={tx.from} />
        <span aria-hidden="true" className="!w-auto shrink-0 text-black/40">
          →
        </span>
        <AddressBadge party={tx.to} />
      </div>
      <div className="max-sm:col-start-2 text-xs text-gray-600 sm:text-sm sm:text-black">
        <When tx={tx} />
      </div>
      <div className="max-sm:col-start-3 max-sm:row-start-1 max-sm:row-span-2 text-right font-semibold">
        <TransactionValue tx={tx} />
      </div>
    </Link>
  );
}

function When({ tx }: { tx: Activity }) {
  if (tx.status === "Pending") {
    return (
      <span className="flex items-center gap-1 text-gray-600">
        <SpinnerIcon className="size-3" />
        Processing
      </span>
    );
  }
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
