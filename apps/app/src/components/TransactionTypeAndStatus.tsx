import { twMerge } from "tailwind-merge";
import { ArrowDownIcon } from "../icons/ArrowDownIcon";
import { ArrowUpIcon } from "../icons/ArrowUpIcon";
import { ConfirmationsIcon } from "../icons/ConfirmationsIcon";
import { DatabaseArrowIcon } from "../icons/DatabaseArrowIcon";
import { ShieldCheckIcon } from "../icons/ShieldCheckIcon";
import { ShieldSlashIcon } from "../icons/ShieldSlashIcon";
import { SpinnerIcon } from "../icons/SpinnerIcon";
import { requiredConfirmations } from "../lib/wallet/pending";
import type { Activity } from "../lib/wallet/types";

type PendingTx = Pick<Activity, "tx_type"> &
  Partial<Pick<Activity, "confirmations">>;

const pendingLabel = ({ tx_type, confirmations }: PendingTx) =>
  confirmations
    ? `Confirming ${confirmations}/${requiredConfirmations(tx_type)}`
    : "Processing";

/** A spinner until it's mined, then a ring filling one segment per block. */
export function PendingStatus({ tx }: { tx: PendingTx }) {
  return (
    <span className="flex items-center gap-1 text-neutral-500">
      {tx.confirmations ? (
        <ConfirmationsIcon
          done={tx.confirmations}
          of={requiredConfirmations(tx.tx_type)}
          className="size-3.5"
        />
      ) : (
        <SpinnerIcon className="size-3" />
      )}
      {pendingLabel(tx)}
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
