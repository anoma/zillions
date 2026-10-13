/**
 * The rules behind the sync's phases (docs/design/sync-phases.md): where the
 * spam era sits and how far each phase has come.
 */

import { NETWORK } from "../config";
import type { Pool, PoolScan, Segment, ShieldedScan } from "../types";

export const POOLS = [
  "ironwood",
  "orchard",
  "sapling",
] as const satisfies Pool[];

/**
 * `paused`: history waits because the browser saves data. `spam-off`: all but
 * the spam era is read, and the user hasn't started (or paused) it.
 */
export type SyncPhase =
  | "catch-up"
  | "setup"
  | "history"
  | "paused"
  | "spam"
  | "spam-off"
  | "done";

export type SyncProgress = {
  phase: SyncPhase;
  /** 0 to 100; absent while the phase's size isn't known yet. */
  percentage?: number;
  /** History: the estimated time (ms) of the oldest block read in every pool. */
  backTo?: number;
  /** History: whether the user sped it up (every core); `VITE_ALLOW_CPU_TO_FRY` always is. */
  spedUp?: boolean;
  fry?: boolean;
  /** Whether `sync()` is running: catch-up or setup still on it once false means it failed. */
  syncing?: boolean;
};

/**
 * The spam era on mainnet (heights 1,710,000 to 2,100,000), as each pool's
 * first chunk reaching its start and its end. Chunks never change once
 * written. Testnet has none.
 */
const SPAM =
  NETWORK === "main"
    ? {
        end: 2_100_000,
        chunks: { orchard: [20, 2_868], sapling: [72, 4_386] } as Partial<
          Record<Pool, [number, number]>
        >,
      }
    : undefined;

/** A pool's segments before anything is read: `last` is its newest chunk, `birthday` the first that can hold its notes. */
export function newPoolScan(
  pool: Pool,
  last: number,
  birthday: number,
): PoolScan {
  // A pool smaller than the spam era's chunks (only in tests) ends early.
  const [start, end] = (SPAM?.chunks[pool] ?? [0, 0]).map((c) =>
    Math.min(c, last + 1),
  );
  const top = Math.max(end, birthday);
  return {
    top: { floor: top, from: last + 1, to: last },
    before: { floor: birthday, from: start, to: start - 1 },
    spam: { floor: Math.max(start, birthday), from: end, to: end - 1 },
  };
}

/** Chunks of `[floor, ceil]` in `segment`'s read run, and in all. */
function span(segment: Segment, floor: number, ceil: number) {
  const total = Math.max(0, ceil - floor + 1);
  const read =
    segment.from > segment.to
      ? 0
      : Math.max(
          0,
          Math.min(ceil, segment.to) - Math.max(segment.from, floor) + 1,
        );
  return { read: Math.min(read, total), total };
}

/** Sapling decrypts ~2× slower, so it counts double. */
const weight = (pool: Pool) => (pool === "sapling" ? 2 : 1);

/** The estimated time of `height`, from the tip's at `now`: 75 s blocks, 150 s before Blossom. */
function heightTime(height: number, tip: number, now: number) {
  const blossom = NETWORK === "main" ? 653_600 : 584_000;
  const slow = Math.max(0, blossom - height);
  return now - ((tip - height) * 75 + slow * 75) * 1000;
}

/** How far `phase` has come over `scan`; `tip` and `now` date history's progress. */
export function progressOf(
  scan: ShieldedScan,
  phase: SyncPhase,
  tip: number,
  now = Date.now(),
): SyncProgress {
  const pools = POOLS.flatMap((pool) =>
    scan.scanned[pool] ? [[pool, scan.scanned[pool]] as const] : [],
  );
  let [read, total] = [0, 0];
  const add = (pool: Pool, part: { read: number; total: number }) => {
    read += part.read * weight(pool);
    total += part.total * weight(pool);
  };

  if (phase === "setup") {
    for (const [pool, { top, setup }] of pools)
      add(pool, span(top, setup ?? top.floor, top.to));
  } else if (phase === "history") {
    for (const [pool, p] of pools) {
      add(pool, span(p.top, p.top.floor, (p.setup ?? p.top.floor) - 1));
      add(pool, span(p.before, p.before.floor, p.before.to));
    }
    // The pool read least far back bounds how far back all of them are.
    const left = pools.filter(([, p]) => p.top.from > p.top.floor);
    const oldest = left.length
      ? Math.max(...left.map(([, p]) => p.oldestHeight ?? tip))
      : (SPAM?.end ?? 0);
    return {
      phase,
      percentage: total ? (read / total) * 100 : 100,
      backTo: heightTime(oldest, tip, now),
    };
  } else if (phase === "spam") {
    for (const [pool, p] of pools)
      add(pool, span(p.spam, p.spam.floor, p.spam.to));
  } else {
    return { phase };
  }
  return { phase, percentage: total ? (read / total) * 100 : 100 };
}

/** What runs in the background once setup is done, or why nothing does. */
export function backgroundPhase(
  scan: ShieldedScan,
  tip: number,
  historyAllowed: boolean,
): "history" | "paused" | "spam" | "spam-off" | "done" {
  if (progressOf(scan, "history", tip).percentage! < 100)
    return historyAllowed ? "history" : "paused";
  if (progressOf(scan, "spam", tip).percentage! < 100)
    return scan.spamSync ? "spam" : "spam-off";
  return "done";
}
