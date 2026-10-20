import { transactionValue } from "../lib/utils";
import type { Activity } from "../lib/wallet/types";
import { ZecValue } from "./ZecValue";

export function TransactionValue({
  tx,
  className,
}: {
  tx: Pick<Activity, "tx_type" | "value" | "fee" | "self">;
  className?: string;
}) {
  const { signal, value } = transactionValue(tx);
  return (
    <span>
      {signal}
      <ZecValue zat={value} className={className} />
    </span>
  );
}
