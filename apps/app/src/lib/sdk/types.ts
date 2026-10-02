export type Network = "main" | "test";

export type SummaryAccountBalances = Array<
  [
    number, // account id
    {
      sapling_balance: number;
      orchard_balance: number;
      unshielded_balance: number;
      pending_change: number;
      pending_spendable: number;
    },
  ]
>;

export type TransactionReceipt = {
  txid: string;
  tx_type: "Received" | "Sent" | "Shielded" | "Unshielded" | "Migrated";
  value: bigint;
  fee: bigint;
  block_height: number;
  confirmations: number;
  status: "Confirmed" | "Pending" | "Expired";
  memo: string | undefined;
  /** Unix seconds. */
  timestamp?: number;
  pool: "ironwood" | "orchard" | "sapling" | "transparent" | "mixed";
  from: Party;
  to: Party;
};

/**
 * One side of a transaction: someone else's address, or just the pool when
 * the address isn't shown — our own, or a shielded sender, never revealed. A
 * migration names the shielded pools it moved between.
 */
export type Party =
  | { address: string }
  | { pool: "shielded" | "transparent" | "sapling" | "orchard" | "ironwood" };
