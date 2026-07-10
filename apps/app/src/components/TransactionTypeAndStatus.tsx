import { ArrowDownIcon } from "../icons/ArrowDownIcon";
import { ArrowUpIcon } from "../icons/ArrowUpIcon";
import { DatabaseArrowIcon } from "../icons/DatabaseArrowIcon";
import { ShieldCheckIcon } from "../icons/ShieldCheckIcon";
import { ShieldSlashIcon } from "../icons/ShieldSlashIcon";
import type { TransactionReceipt } from "../lib/sdk/types";

export function TransactionTypeAndStatus({
  tx,
}: {
  tx: Pick<TransactionReceipt, "tx_type" | "status">;
}) {
  return (
    <div className="flex items-center gap-2">
      {tx.tx_type === "Sent" ? (
        <ArrowUpIcon className="size-4" />
      ) : tx.tx_type === "Received" ? (
        <ArrowDownIcon className="size-4" />
      ) : tx.tx_type === "Shielded" ? (
        <ShieldCheckIcon className="size-4" />
      ) : tx.tx_type === "Unshielded" ? (
        <ShieldSlashIcon className="size-4" />
      ) : tx.tx_type === "Migrated" ? (
        <DatabaseArrowIcon className="size-4" />
      ) : null}
      {tx.tx_type}
      {tx.status !== "Confirmed" && ` (${tx.status})`}
    </div>
  );
}
