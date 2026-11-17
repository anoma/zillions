import { SpinnerIcon } from "../icons/SpinnerIcon";
import { transactionValue } from "../lib/utils";
import type { Activity } from "../lib/wallet/types";
import { ZecValue } from "./ZecValue";

/** A spinner standing in for what sync hasn't found yet, named by `label` for screen readers. */
export function Unknown({
  label,
  className = "size-4",
}: {
  label: string;
  className?: string;
}) {
  return (
    <span className="inline-flex items-center">
      <SpinnerIcon aria-hidden="true" className={className} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function TransactionValue({
  tx,
}: {
  tx: Pick<Activity, "tx_type" | "value" | "fee" | "self" | "unproven">;
}) {
  if (tx.unproven)
    return (
      <Unknown label="Amount not known yet" className="size-4 text-gray-500" />
    );
  const { signal, value } = transactionValue(tx);
  return (
    <span>
      {signal}
      <ZecValue zat={value} />
    </span>
  );
}
