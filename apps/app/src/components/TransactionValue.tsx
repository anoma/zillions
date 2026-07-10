import type { TransactionReceipt } from "../lib/sdk/types";
import { ZecValue } from "./ZecValue";

export function TransactionValue({ tx }: { tx: TransactionReceipt }) {
  let value = tx.value;
  // Sent values come back negative; flip to positive for display.
  if (tx.tx_type === "Sent") {
    value *= -1n;
  }
  // Shielded/migrated values exclude the fee; add it back for the total amount.
  if (tx.tx_type === "Shielded" || tx.tx_type === "Migrated") {
    value += tx.fee;
  }

  let signal = "";
  // Prefix received amounts with + to show the balance increase.
  if (tx.tx_type === "Received") {
    signal = "+";
  }

  return (
    <span>
      {signal}
      <ZecValue zat={value} />
    </span>
  );
}
