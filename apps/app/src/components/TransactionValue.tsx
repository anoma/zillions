import { transactionValue } from "../lib/utils";
import type { Activity } from "../lib/wallet/types";
import { ZecValue } from "./ZecValue";

export function TransactionValue({
  tx,
}: {
  tx: Pick<Activity, "tx_type" | "value" | "fee" | "self">;
}) {
  const { signal, value } = transactionValue(tx);
  return (
    <span>
      {signal}
      <ZecValue zat={value} />
    </span>
  );
}
