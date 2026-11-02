import { NETWORK } from "../config";

const BLOSSOM = NETWORK === "main" ? 653_600 : 584_000;

/** ZIP 218 cuts block time from 75 to 25 seconds at this height. */
export const NU7 = NETWORK === "main" ? 3_543_405 : 4_465_026;

let tip = 0;

/** Records the chain height just read, which decides the block time. */
export const sawTip = (height: number) => {
  tip = Math.max(tip, height);
};

/** The target time of the next block, in seconds. */
export const blockSeconds = () => (tip + 1 < NU7 ? 75 : 25);

/** The target time from block `from` to block `to`, in seconds, as upstream's `target_time_between`. */
export function secondsBetween(from: number, to: number) {
  const below = (height: number) =>
    Math.max(0, Math.min(to, height - 1) - Math.min(from, height - 1));
  return (to - from) * 25 + below(NU7) * 50 + below(BLOSSOM) * 75;
}

/** The last height a transaction expiring at `expiry` can be mined at: one built before NU7 is invalid from it on. */
export const minedBy = (expiry: number) =>
  tip + 1 < NU7 ? Math.min(expiry, NU7 - 1) : expiry;
