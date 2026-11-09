import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import {
  type PendingTx,
  usePendingProgress,
} from "../hooks/usePendingProgress";
import { ArrowDownIcon } from "../icons/ArrowDownIcon";
import { ArrowUpIcon } from "../icons/ArrowUpIcon";
import { ClockIcon } from "../icons/ClockIcon";
import { DatabaseArrowIcon } from "../icons/DatabaseArrowIcon";
import { ShieldCheckIcon } from "../icons/ShieldCheckIcon";
import { ShieldSlashIcon } from "../icons/ShieldSlashIcon";
import type { Activity } from "../lib/wallet/types";
import { Tooltip } from "./Tooltip";

/** The type icon in `children` with a clock on its corner; hovering or tapping it says how far along it is. */
export function PendingIcon({
  tx,
  children,
}: {
  tx: PendingTx;
  children: ReactNode;
}) {
  const { detail } = usePendingProgress(tx);
  return (
    // A tap opens the tooltip instead of the row's link.
    <span
      className="inline-flex"
      onClick={(e) =>
        (e.nativeEvent as PointerEvent).pointerType !== "mouse" &&
        e.preventDefault()
      }
    >
      <Tooltip
        className="z-10 w-max px-3 py-2 left-0 translate-x-0 whitespace-nowrap font-normal"
        content={<span className="font-medium">Processing · {detail}</span>}
      >
        <span className="relative flex">
          {children}
          <ClockIcon
            aria-hidden="true"
            className="absolute -right-1 -bottom-1 size-3.5 rounded-full bg-surface text-gray-600"
          />
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
            : tx_type === "Migrated" || tx_type === "Prepared"
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
      {tx.status === "Expired" && " (Expired)"}
    </div>
  );
}
