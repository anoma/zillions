import type { TransactionReceipt } from "../lib/sdk/types";
import { zatoshiToZec } from "../lib/utils";

export function TransactionValue({ tx }: { tx: TransactionReceipt }) {
  let value = tx.value;
  // on sent, the value is negative, but we want to present as positive value
  if (tx.tx_type === "Sent") {
    value *= -1n;
  }
  // on shielded of migrated, include the fee so user have a better perception of the total value of the transaction
  if (tx.tx_type === "Shielded" || tx.tx_type === "Migrated") {
    value += tx.fee;
  }

  let signal = "";
  // on received, we want to enforce the increased balance, so add the plus sign
  if (tx.tx_type === "Received") {
    signal = "+";
  }

  return (
    <span>
      {signal}
      {zatoshiToZec(value)}
      <span className="text-[0.6em]"> ZEC</span>
    </span>
  );
}
