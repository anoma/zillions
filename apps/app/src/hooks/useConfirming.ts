import { useState } from "react";
import { useGetTransactionHistory } from "./useGetTransactionHistory";
import { useNow } from "./useNow";
import { countdown, LATE, progressOf } from "./usePendingProgress";

/** Ms until the slowest pending transaction is done, as its clock plans it; none while none is pending or one runs late. */
export function useReadyIn() {
  const history = useGetTransactionHistory().data ?? [];
  const now = useNow(1000);
  const plans = history
    .filter((tx) => tx.status === "Pending")
    .map((tx) => progressOf(tx, now));
  if (!plans.length || plans.some((p) => p.left === undefined)) {
    return undefined;
  }
  return Math.max(...plans.map((p) => p.until)) - now;
}

/** When funds still processing will be ready, for the user; `minutes` rounds it up to whole minutes, for screen readers. */
export function readyIn(ms: number | undefined, minutes = false) {
  if (ms === undefined) return `${LATE}.`;
  return minutes
    ? `It'll be ready in about ${Math.ceil(ms / 60_000)} min.`
    : `It'll be ready in ${countdown(ms)}.`;
}

/**
 * A form's submit while funds it needs are still `confirming`: it's held and
 * the form says why, until they confirm and the form says it can go, unless
 * it's `short` of them after all.
 */
export function useConfirming(confirming: boolean, short: boolean) {
  const [asked, setAsked] = useState(false);
  return {
    notice: !asked
      ? undefined
      : confirming
        ? ("waiting" as const)
        : short
          ? undefined
          : ("ready" as const),
    /** Whether this submit waits on confirming funds. */
    held: () => {
      setAsked(confirming);
      return confirming;
    },
    reset: () => setAsked(false),
  };
}
