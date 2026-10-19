import { twMerge } from "tailwind-merge";
import { useNow } from "../hooks/useNow";
import { ArrowDownIcon } from "../icons/ArrowDownIcon";
import { ArrowUpIcon } from "../icons/ArrowUpIcon";
import { ConfirmationsIcon } from "../icons/ConfirmationsIcon";
import { DatabaseArrowIcon } from "../icons/DatabaseArrowIcon";
import { ShieldCheckIcon } from "../icons/ShieldCheckIcon";
import { ShieldSlashIcon } from "../icons/ShieldSlashIcon";
import { SpinnerIcon } from "../icons/SpinnerIcon";
import {
  BLOCK_SECONDS,
  minutesLeft,
  PROCESSING_ESTIMATE_MIN,
  requiredConfirmations,
} from "../lib/wallet/pending";
import type { Activity } from "../lib/wallet/types";
import { Tooltip } from "./Tooltip";

type PendingTx = Pick<Activity, "tx_type"> &
  Partial<Pick<Activity, "confirmations" | "timestamp" | "expires_in">>;

const pendingLabel = ({ tx_type, confirmations }: PendingTx) =>
  confirmations
    ? `Confirming ${confirmations}/${requiredConfirmations(tx_type)}`
    : "Processing";

const minutes = (blocks: number) =>
  Math.max(1, Math.ceil((blocks * BLOCK_SECONDS) / 60));

/** What a pending transaction waits for at `now`: a short label and a longer explanation. */
function waiting(tx: PendingTx, now: number) {
  if (tx.confirmations) {
    const of = requiredConfirmations(tx.tx_type);
    return {
      label: pendingLabel(tx),
      detail: `Included in a block. It's complete after ${of} confirmations, one per new block, about every ${BLOCK_SECONDS} seconds: about ${minutes(of - tx.confirmations)} min to go.`,
    };
  }
  const left =
    tx.timestamp === undefined ? undefined : minutesLeft(tx.timestamp, now);
  if (left === 0) {
    return {
      label: "Still processing",
      detail: `Taking longer than usual: some blocks take several minutes.${tx.expires_in !== undefined ? ` If it isn't included in the next ${tx.expires_in} blocks (about ${minutes(tx.expires_in)} min), it expires and the funds stay in your wallet.` : ""}`,
    };
  }
  return {
    label: left === undefined ? "Processing" : `Processing · ~${left} min`,
    detail: `Waiting for the network to include it in a block. This usually takes about ${PROCESSING_ESTIMATE_MIN} minutes.`,
  };
}

/** A spinner until it's mined, then a ring filling one segment per block; hovering or tapping it explains the wait. */
export function PendingStatus({ tx }: { tx: PendingTx }) {
  const now = useNow(10_000);
  const { label, detail } = waiting(tx, now);
  return (
    // A tap opens the tooltip instead of the row's link.
    <span
      onClick={(e) =>
        (e.nativeEvent as PointerEvent).pointerType !== "mouse" &&
        e.preventDefault()
      }
    >
      <Tooltip
        className="z-10 w-60 p-3 font-normal translate-x-0 max-sm:left-0 sm:left-auto sm:right-0 text-left"
        content={detail}
      >
        <span className="flex items-center gap-1 whitespace-nowrap text-neutral-500">
          {tx.confirmations ? (
            <ConfirmationsIcon
              done={tx.confirmations}
              of={requiredConfirmations(tx.tx_type)}
              className="size-3.5"
            />
          ) : (
            <SpinnerIcon className="size-3" />
          )}
          {label}
        </span>
      </Tooltip>
    </span>
  );
}

export function TransactionTypeIcon({
  tx_type,
  className,
}: Pick<Activity, "tx_type"> & { className?: string }) {
  const Icon =
    tx_type === "Sent"
      ? ArrowUpIcon
      : tx_type === "Received"
        ? ArrowDownIcon
        : tx_type === "Shielded"
          ? ShieldCheckIcon
          : tx_type === "Unshielded"
            ? ShieldSlashIcon
            : tx_type === "Migrated"
              ? DatabaseArrowIcon
              : null;
  return Icon && <Icon className={twMerge("size-4", className)} />;
}

export function TransactionTypeAndStatus({
  tx,
  iconClassName,
}: {
  tx: PendingTx & Partial<Pick<Activity, "status">>;
  iconClassName?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <TransactionTypeIcon tx_type={tx.tx_type} className={iconClassName} />
      {tx.tx_type}
      {tx.status &&
        tx.status !== "Confirmed" &&
        ` (${tx.status === "Pending" ? pendingLabel(tx) : tx.status})`}
    </div>
  );
}
