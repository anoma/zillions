import { blockSeconds } from "../lib/wallet/chain/blockTime";
import { plan, type Progress, progressAt } from "../lib/wallet/pending";
import type { Activity } from "../lib/wallet/types";
import { useNow } from "./useNow";

export type PendingTx = Pick<Activity, "txid" | "tx_type"> &
  Partial<Pick<Activity, "confirmations" | "timestamp" | "expires_in">>;

// Module-wide, so the list and the detail page move one bar; a reload plans afresh.
const plans = new Map<string, Progress>();

const blockMinutes = (blocks: number) =>
  Math.max(1, Math.ceil((blocks * blockSeconds()) / 60));

/** How far along `tx` is, none once late, and the time left, or why it's late before it's mined. */
export function usePendingProgress(tx: PendingTx) {
  const now = useNow(1000);
  const progress = plan(tx, now, plans.get(tx.txid));
  plans.set(tx.txid, progress);
  const { percent, minutes } = progressAt(progress, now);
  const detail =
    minutes !== undefined
      ? `About ${minutes} min left`
      : tx.confirmations
        ? undefined
        : `Taking longer than usual: some blocks take several minutes.${tx.expires_in !== undefined ? ` If it isn't included in the next ${tx.expires_in} blocks (about ${blockMinutes(tx.expires_in)} min), it expires and the funds stay in your wallet.` : ""}`;
  return { percent, detail };
}
