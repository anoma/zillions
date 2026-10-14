import { twMerge } from "tailwind-merge";
import { ArrowDownIcon } from "../icons/ArrowDownIcon";
import { ArrowUpIcon } from "../icons/ArrowUpIcon";
import { DatabaseArrowIcon } from "../icons/DatabaseArrowIcon";
import { ShieldCheckIcon } from "../icons/ShieldCheckIcon";
import { ShieldSlashIcon } from "../icons/ShieldSlashIcon";
import type { Activity } from "../lib/wallet/types";

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
  tx: Pick<Activity, "tx_type"> & Partial<Pick<Activity, "status">>;
  iconClassName?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <TransactionTypeIcon tx_type={tx.tx_type} className={iconClassName} />
      {tx.tx_type}
      {tx.status && tx.status !== "Confirmed" && ` (${tx.status})`}
    </div>
  );
}
