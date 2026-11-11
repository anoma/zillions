import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import { useGetTransactionHistory } from "../hooks/useGetTransactionHistory";
import type {
  Activity,
  CheckSwapExecutionStatusResponse,
  Token,
} from "../lib/wallet/types";
import { AddressBadge } from "./AddressBadge";
import { PageError } from "./PageError";
import { PageLoader } from "./PageLoader";
import { PendingIcon, TransactionTypeIcon } from "./TransactionTypeAndStatus";
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
  const [tokens, setTokens] = useState<Token[]>([]);

  // Fetch available tokens. Required for displaying token assets un human readable form.
  useEffect(() => {
    fetch("https://1click.chaindefuser.com/v0/tokens")
      .then((res) => res.json())
      .then((data) => setTokens(data))
      .catch((err) => console.error("Failed to fetch tokens", err));
  }, []);

  if (transactionHistory.isPending) {
    return <PageLoader />;
  }

  if (!transactionHistory.isSuccess) {
    return <PageError>{String(transactionHistory.error)}</PageError>;
  }

  // Grab limit entries if limit is defined. Prioritize swaps over ordinary transactions.
  const allSwaps = transactionHistory.data.swaps;
  const shownSwaps = limit ? allSwaps.slice(0, limit) : allSwaps;
  const all = transactionHistory.data.activities;
  const shown = limit ? all.slice(0, limit - shownSwaps.length) : all;

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
        {shownSwaps.map((swap) => (
          <SwapRow key={swap.correlationId} swap={swap} tokens={tokens} />
        ))}
        {shown.map((tx) => (
          <Row key={tx.txid} tx={tx} />
        ))}
      </div>
    </section>
  );
}

/**
 * Display a pending swap. I.e. the time at which the quotation was produced, the original
 * asset, the destination asset, and the balance increase expected in the destination asset.
 */
function SwapRow({
  swap,
  tokens,
}: {
  swap: CheckSwapExecutionStatusResponse;
  tokens: Token[];
}) {
  // Use the first intent hash for the dynamic URL
  const txHash = swap.quoteResponse.quote.depositAddress;

  // Look up symbols from the tokens array, fallback to the raw asset string if not found
  const originSymbol =
    tokens.find(
      (t) => t.assetId === swap.quoteResponse.quoteRequest.originAsset,
    )?.symbol || swap.quoteResponse.quoteRequest.originAsset;

  const destinationSymbol =
    tokens.find(
      (t) => t.assetId === swap.quoteResponse.quoteRequest.destinationAsset,
    )?.symbol || swap.quoteResponse.quoteRequest.destinationAsset;

  return (
    <a
      href={`https://explorer.near-intents.org/transactions/${txHash}`}
      target="_blank"
      rel="noopener noreferrer"
      className={twMerge(
        rowClassName,
        "py-4 px-4 transition-colors duration-300 hover:bg-card",
        "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-black",
      )}
    >
      <span className="size-9 grid place-items-center rounded-full bg-black/5 text-gray-600">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="size-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
          />
        </svg>
      </span>

      <div>
        <div>Pending Swap</div>
        <div className="mt-0.5 text-xs text-gray-600">
          <time>
            {new Date(swap.updatedAt).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>
        </div>
      </div>

      <div
        className={twMerge(
          "min-w-0 flex items-center gap-3 text-gray-600",
          routeClassName,
        )}
      >
        <span className="text-sm font-medium">{originSymbol}</span>
        <span aria-hidden="true" className="text-black/30">
          →
        </span>
        <span className="text-sm font-medium">{destinationSymbol}</span>
      </div>

      <div className="text-right text-base font-semibold">
        +{swap.quoteResponse.quote.amountOutFormatted}
        <span className="text-[max(0.7rem,0.5em)]"> {destinationSymbol}</span>
      </div>
    </a>
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
      {tx.status === "Pending" ? (
        <PendingIcon tx={tx}>
          <TypeIcon tx={tx} />
        </PendingIcon>
      ) : (
        <TypeIcon tx={tx} />
      )}
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
        <TransactionValue tx={tx} />
      </div>
    </Link>
  );
}

function TypeIcon({ tx }: { tx: Activity }) {
  return (
    <span className="size-9 grid place-items-center rounded-full bg-black/5 text-gray-600">
      <TransactionTypeIcon tx_type={tx.tx_type} />
    </span>
  );
}

function When({ tx }: { tx: Activity }) {
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
