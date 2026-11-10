import { blockSeconds } from "./chain/blockTime";
import type { Activity, PendingTx } from "./types";

/**
 * Blocks past a pending transaction's expiry before it's dropped: the indexer
 * trails the chain, and one mined at its last height must show up first.
 */
export const EXPIRY_MARGIN = 30;

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
      memo: receipt!.memo,
      pool: "mixed",
    }));

/** Confirmations a mined transaction needs to show as completed, as zcore's `ConfirmationsPolicy::MIN` spends it. */
export const REQUIRED_CONFIRMATIONS = 1;

/** Mined `history` with its confirmations at `tip`, each already enough to complete it; an unknown tip leaves it as is. */
export const confirmedAt = (history: Activity[], tip: number | undefined) =>
  tip === undefined
    ? history
    : history.map((tx): Activity => ({
        ...tx,
        // The indexer can be past the tip this session last read.
        confirmations: Math.max(1, tip - tx.block_height + 1),
      }));

/** Between syncs the tip is checked this often, and a new block syncs at once. */
export const tipCheckMs = () => (blockSeconds() / 5) * 1000;

/** About how long a broadcast takes to show mined: the next block, then the tip check that finds it. */
const processingMs = () => blockSeconds() * 1000 + tipCheckMs();

/**
 * A pending transaction's progress, planned at its last event (first seen,
 * mined, each new block): `bar` at `at` (ms), filling evenly to done at
 * `until`. Once a plan runs out it's `late` for good.
 */
export type Progress = {
  confirmations: number;
  at: number;
  bar: number;
  until: number;
  late: boolean;
};

type Tracked = Pick<Activity, "tx_type"> &
  Partial<Pick<Activity, "confirmations" | "timestamp">>;

/** What's left of `tx`'s wait: the processing until it's mined, which confirms it. */
const leftMs = ({ confirmations = 0 }: Tracked) =>
  confirmations ? 0 : processingMs();

const barAt = (p: Progress, now: number) =>
  p.until > p.at
    ? p.bar + (1 - p.bar) * Math.min(1, (now - p.at) / (p.until - p.at))
    : 1;

/**
 * `prev` carried to `tx` at `now`: an event spreads what's left of the bar over the new time left.
 * First seen, it's planned from the broadcast, or the block it was mined in.
 */
export function plan(tx: Tracked, now: number, prev?: Progress): Progress {
  const confirmations = tx.confirmations ?? 0;
  if (prev?.confirmations === confirmations) return prev;
  if (prev) {
    return {
      confirmations,
      at: now,
      bar: barAt(prev, now),
      until: now + leftMs(tx),
      late: prev.late || now >= prev.until,
    };
  }
  const start =
    tx.timestamp === undefined
      ? now
      : tx.timestamp * 1000 -
        (confirmations && tx.tx_type !== "Received" ? processingMs() : 0);
  return {
    confirmations,
    at: start,
    bar: 0,
    until: confirmations ? now + leftMs(tx) : start + leftMs(tx),
    late: false,
  };
}

/** The whole percent done, none once late, and the ms left while the plan runs. */
export const progressAt = (p: Progress, now: number) => ({
  percent:
    p.late || now >= p.until ? undefined : Math.floor(barAt(p, now) * 100),
  left: now < p.until ? p.until - now : undefined,
});
