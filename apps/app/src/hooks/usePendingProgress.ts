import { plan, type Progress, progressAt } from "../lib/wallet/pending";
import type { Activity } from "../lib/wallet/types";
import { useNow } from "./useNow";

export type PendingTx = Pick<Activity, "txid" | "tx_type"> &
  Partial<Pick<Activity, "confirmations" | "timestamp">>;

// Module-wide, so the list and the detail page move one bar; a reload plans afresh.
const plans = new Map<string, Progress>();

/** `tx`'s progress at `now`, and when it's planned done (ms), on the same plan wherever it shows. */
export function progressOf(tx: PendingTx, now: number) {
  const progress = plan(tx, now, plans.get(tx.txid));
  plans.set(tx.txid, progress);
  return { ...progressAt(progress, now), until: progress.until };
}

/** What a pending transaction, or funds waiting on one, say once past the estimate. */
export const LATE = "Taking longer than usual";

/** `ms` as a countdown: "42s", "3m 05s". */
export function countdown(ms: number) {
  const s = Math.max(1, Math.ceil(ms / 1000));
  return s < 60
    ? `${s}s`
    : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/** How far along `tx` is, for the bar, and the time left, or that it's late. */
export function usePendingProgress(tx: PendingTx) {
  const now = useNow(1000);
  const { percent, left } = progressOf(tx, now);
  const detail = left === undefined ? LATE : `${countdown(left)} left`;
  return { percent, detail };
}
