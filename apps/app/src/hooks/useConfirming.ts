import { useState } from "react";
import { useGetTransactionHistory } from "./useGetTransactionHistory";
import { useNow } from "./useNow";
import { progressOf } from "./usePendingProgress";

/** Ms until the slowest pending transaction is done, as its clock plans it; none while none is pending or one runs late. */
export function useReadyIn() {
  const history = useGetTransactionHistory().data ?? [];
  const now = useNow(1000);
  const plans = history
    .filter((tx) => tx.status === "Pending")
    .map((tx) => progressOf(tx, now));
  if (!plans.length || plans.some((p) => p.minutes === undefined)) {
    return undefined;
  }
  return Math.max(...plans.map((p) => p.until)) - now;
}

/** `ms` as a countdown: "42 s", "3 min 05 s". */
export function countdown(ms: number) {
  const s = Math.max(1, Math.ceil(ms / 1000));
  return s < 60
    ? `${s} s`
    : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

/** When funds still confirming will be ready, for the user; `minutes` rounds it up to whole minutes. */
export function readyIn(ms: number | undefined, minutes = false) {
  if (ms === undefined) {
    return "It's taking longer than usual: some blocks take several minutes.";
  }
  const left = minutes ? `${Math.ceil(ms / 60_000)} min` : countdown(ms);
  return `It'll be ready in about ${left}.`;
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
