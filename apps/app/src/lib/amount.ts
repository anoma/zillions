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
 * Who a send form plans against: the recipient once it's a valid address.
 * Until then a link or Max plans against `standIn`, our own address, for the
 * fee; a typed amount waits, so a bad address can't pass for a balance problem.
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

/**
 * Whether `amount` is more than the source holds. Fees, a link's claim fee
 * included, aren't counted: going over by a fee shows as a ceiling instead.
 */
export function isOverBalance(amount: bigint, available: bigint) {
  return amount > available;
}

/**
 * The most the user can send instead, or undefined when nothing caps them.
 * `most` is the most the source can fund after fees; `extra` is funded on top
 * of what the user sends (a link's claim fee) and is in `wanted` already.
 * `short` means `wanted` failed to plan.
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
