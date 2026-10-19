import type { Activity, PendingTx } from "./types";

/**
 * Blocks past a pending transaction's expiry before it's dropped: the indexer
 * trails the chain, and one mined at its last height must show up first.
 */
export const EXPIRY_MARGIN = 10;

/** Nullifiers and `txid:index` outpoints pending transactions spend. */
export const held = (pending: PendingTx[]) => ({
  notes: new Set(pending.flatMap((p) => p.nullifiers)),
  coins: new Set(pending.flatMap((p) => p.outpoints)),
});

/**
 * `pending` less what's seen mined (a spend of it is on chain, or the
 * transparent sync found it) or past expiry. An unknown tip expires nothing.
 */
export const prunePending = (
  pending: PendingTx[],
  seen: { spent: Set<string>; mined: Set<string>; tip?: number },
) =>
  pending.filter(
    (p) =>
      !seen.mined.has(p.txid) &&
      !p.nullifiers.some((nf) => seen.spent.has(nf)) &&
      (p.expiryHeight === 0 ||
        seen.tip === undefined ||
        seen.tip <= p.expiryHeight + EXPIRY_MARGIN),
  );

/**
 * What history lists for pending transactions not in `mined`, newest first,
 * with the blocks each has left to be mined once `tip` is known.
 */
export const pendingActivity = (
  pending: PendingTx[],
  mined: Set<string>,
  tip?: number,
): Activity[] =>
  pending
    .filter((p) => p.receipt && !mined.has(p.txid))
    .reverse()
    .map(({ txid, receipt, expiryHeight }) => ({
      ...receipt!,
      txid,
      status: "Pending",
      block_height: 0,
      confirmations: 0,
      memo: receipt!.memo,
      pool: "mixed",
      ...(expiryHeight > 0 &&
        tip !== undefined && {
          expires_in: Math.max(0, expiryHeight - tip),
        }),
    }));

/**
 * Confirmations a mined transaction needs to show as completed:
 * zcash_client_backend's `ConfirmationsPolicy` defaults, trusted for our
 * own transactions and untrusted for a payment from someone else.
 */
export const requiredConfirmations = (tx_type: Activity["tx_type"]) =>
  tx_type === "Received" ? 10 : 3;

/** Mined `history` with its confirmations at `tip`, Pending until it has enough; an unknown tip leaves it as is. */
export const confirmedAt = (history: Activity[], tip: number | undefined) =>
  tip === undefined
    ? history
    : history.map((tx): Activity => {
        // The indexer can be past the tip this session last read.
        const confirmations = Math.max(1, tip - tx.block_height + 1);
        return confirmations < requiredConfirmations(tx.tx_type)
          ? { ...tx, confirmations, status: "Pending" }
          : { ...tx, confirmations };
      });

/** About how long a broadcast takes to show mined: a 75 s block, the indexer, a minute's re-sync, with room. */
export const PROCESSING_ESTIMATE_MIN = 5;
