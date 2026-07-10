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
  timestamp: number;
  pool: "orchard" | "sapling" | "transparent" | "mixed";
  to_address: string | undefined;
  from_address: string | undefined;
};
