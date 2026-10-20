import { zatoshiToZec, zecToZatoshi } from "./utils";

/** Why an amount field's amount is 0, for the user. */
export function missingAmount(text: string, isMax: boolean) {
  if (isMax || !text.trim()) return "Set an amount";
  try {
    zecToZatoshi(text);
    return "The smallest amount is 0.00000001 ZEC";
  } catch {
    return "Not a valid amount";
  }
}

/** The text an amount field draws: under Max its result once known, 0 included. */
export function shownAmount(text: string, isMax: boolean, amount?: bigint) {
  if (!isMax) return text;
  return amount === undefined ? "" : zatoshiToZec(amount);
}

/**
 * The address to plan against: `to` once valid; until then `standIn` for a
 * link or Max, and "" (no plan) for a typed amount.
 */
export function planRecipient({
  to,
  valid,
  isMax,
  isPaymentLink,
  standIn,
}: {
  to: string;
  valid: boolean;
  isMax: boolean;
  isPaymentLink: boolean;
  standIn: string;
}) {
  if (isPaymentLink) return standIn;
  if (valid) return to;
  return isMax ? standIn : "";
}

/** Whether `amount` alone exceeds `available`: fees, claim fee too, don't count. */
export function isOverBalance(amount: bigint, available: bigint) {
  return amount > available;
}

/**
 * The most the user can send instead, or undefined when nothing caps them.
 * `most` is what the source funds after fees, `wanted` already includes
 * `extra` (a link's claim fee), and `short` means `wanted` failed to plan.
 */
export function ceilingOf({
  most,
  wanted,
  short,
  max,
  extra,
}: {
  most?: bigint;
  wanted: bigint;
  short: boolean;
  max: boolean;
  extra: bigint;
}) {
  if (most === undefined) return undefined;
  if ((short && wanted > most) || (max && most <= extra)) {
    return most > extra ? most - extra : 0n;
  }
  return undefined;
}

/** What to tell the user when they can send at most `ceiling`. */
export function ceilingProblem(ceiling: bigint) {
  return ceiling > 0n
    ? `Not enough to also pay the fee: you can send up to ${zatoshiToZec(ceiling)} ZEC`
    : "Not enough to pay the fee";
}
