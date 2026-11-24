import {
  GetExecutionStatusResponse,
  OneClickService,
  TokenResponse,
} from "@defuse-protocol/one-click-sdk-typescript";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import { useGetTransactionHistory } from "../hooks/useGetTransactionHistory";
import { ArrowsLeftRight } from "../icons/ArrowsLeftRight";
import type { Activity } from "../lib/wallet/types";
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
const ZEC_TOKEN_ASSET_ID = "nep141:zec.omft.near";

const SWAP_STATUS_DESCRIPTIONS = {
  PENDING_DEPOSIT: "Awaiting your token deposit",
  KNOWN_DEPOSIT_TX: "Deposit transaction detected",
  PROCESSING: "Swap being executed",
  SUCCESS: "Tokens delivered to destination address",
  INCOMPLETE_DEPOSIT: "Deposit below required amount",
  REFUNDED: "Swap failed, funds returned to refund address",
  FAILED: "Swap encountered an error",
};

/** The txids of the chain transactions behind `swaps`, on either side. */
function swapTxids(swaps: GetExecutionStatusResponse[]) {
  return new Set(
    swaps.flatMap(({ swapDetails }) =>
      [
        ...(swapDetails?.originChainTxHashes ?? []),
        ...(swapDetails?.destinationChainTxHashes ?? []),
      ].map(({ hash }) => hash),
    ),
  );
}

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
  const [tokens, setTokens] = useState<TokenResponse[]>([]);

  // Fetch available tokens. Required for displaying token assets un human readable form.
  useEffect(() => {
    OneClickService.getTokens()
      .then((data: TokenResponse[]) => setTokens(data))
      .catch((err) => console.error("Failed to fetch tokens", err));
  }, []);

  if (transactionHistory.isPending) {
    return <PageLoader />;
  }

  if (!transactionHistory.isSuccess) {
    return <PageError>{String(transactionHistory.error)}</PageError>;
  }

  const allSwaps = transactionHistory.data.swaps;
  // A swap's row stands for its chain transactions, so they aren't listed twice.
  const covered = swapTxids(allSwaps);
  const allTxs = transactionHistory.data.activities.filter(
    (tx) => !covered.has(tx.txid),
  );
  // Unconfirmed transactions are dated in the future starting with this timestamp
  const blockHeightSentinel = new Date().getTime() + 1;

  // Combine both arrays into a single array with a 'type' identifier
  // and normalize the timestamp for sorting.
  const all = [
    ...allSwaps.map((swap) => ({
      type: "swap" as const,
      data: swap,
      // Swaps are chronologically placed at the time which the quote was created
      timestamp: new Date(swap.quoteResponse.timestamp),
    })),
    ...allTxs.map((tx) => ({
      type: "tx" as const,
      data: tx,
      // Transactions are placed at their timestamp. Unconfirmed transactions follow
      // confirmed transactions and are ordered according to their block heights.
      timestamp: new Date(
        tx.timestamp
          ? Number(tx.timestamp) * 1000
          : blockHeightSentinel + tx.block_height,
      ),
    })),
  ];

  // Sort the combined array from newest to oldest
  all.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  // Grab limit entries if limit is defined.
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
        {shown.map((item) => {
          if (item.type === "swap") {
            return (
              <SwapRow
                key={item.data.correlationId}
                swap={item.data}
                tokens={tokens}
              />
            );
          } else {
            return <Row key={item.data.txid} tx={item.data} />;
          }
        })}
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
  swap: GetExecutionStatusResponse & { outbound: boolean };
  tokens: TokenResponse[];
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

  // The same dots as the balance card's pool legend.
  const dot = (gold: boolean) => (
    <span
      aria-hidden="true"
      className={twMerge(
        "size-2 shrink-0 rounded-full",
        gold ? "bg-gold" : "bg-black/10 dark:bg-black/25",
      )}
    />
  );
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
        <ArrowsLeftRight className={"size-4"} />
      </span>

      <div>
        <div>Swap: {SWAP_STATUS_DESCRIPTIONS[swap.status]}</div>
        <div className="mt-0.5 text-xs text-gray-600">
          <time>
            {new Date(swap.quoteResponse.timestamp).toLocaleString(undefined, {
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
        {dot(
          swap.quoteResponse.quoteRequest.originAsset === ZEC_TOKEN_ASSET_ID,
        )}
        <span className="text-sm font-medium">{originSymbol}</span>
        <span aria-hidden="true" className="text-black/30">
          →
        </span>
        {dot(
          swap.quoteResponse.quoteRequest.destinationAsset ===
            ZEC_TOKEN_ASSET_ID,
        )}
        <span className="text-sm font-medium">{destinationSymbol}</span>
      </div>

      {swap.outbound ? (
        <div className="text-right text-base font-semibold">
          -{swap.quoteResponse.quote.amountInFormatted}
          <span className="text-[max(0.7rem,0.5em)]"> {originSymbol}</span>
        </div>
      ) : (
        <div className="text-right text-base font-semibold">
          +{swap.quoteResponse.quote.amountOutFormatted}
          <span className="text-[max(0.7rem,0.5em)]"> {destinationSymbol}</span>
        </div>
      )}
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
