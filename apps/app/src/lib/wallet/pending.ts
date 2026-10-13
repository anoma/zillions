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

/** What history lists for pending transactions not in `mined`, newest first. */
export const pendingActivity = (
  pending: PendingTx[],
  mined: Set<string>,
): Activity[] =>
  pending
    .filter((p) => p.receipt && !mined.has(p.txid))
    .reverse()
    .map(({ txid, receipt }) => ({
      ...receipt!,
      txid,
      status: "Pending",
      block_height: 0,
      confirmations: 0,
      memo: undefined,
      pool: "mixed",
    }));
