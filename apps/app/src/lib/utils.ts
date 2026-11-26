import { secondsBetween } from "./wallet/chain/blockTime";
import type { Activity } from "./wallet/types";

const ZATOSHI_PER_ZEC = 100_000_000n;
const DECIMALS = 8;

/**
 * ZIP 318's `MAX_RESIDUAL_VALUE` (0.01 ZEC): less than this stays in Orchard,
 * since moving a distinctive dust amount would single the wallet out.
 */
export const MIGRATION_MINIMUM = ZATOSHI_PER_ZEC / 100n;

/** About how long until block `height`, from `tip`. */
export function fromNow(tip: number, height: number) {
  const minutes = secondsBetween(tip, height) / 60;
  if (minutes < 5) return "now";
  if (minutes < 90) return `~${Math.round(minutes)} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `~${hours} hours` : `~${Math.round(hours / 24)} days`;
}

/** The local clock time of block `height`, from `tip`; with the weekday when it isn't today. */
export function clockAt(tip: number, height: number) {
  const when = new Date(Date.now() + secondsBetween(tip, height) * 1000);
  const time = when.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return when.toDateString() === new Date().toDateString()
    ? time
    : `${when.toLocaleDateString([], { weekday: "short" })} ${time}`;
}

/**
 * CSS font size that fits `chars` characters in the nearest `@container`,
 * never above `max`. 0.65em is Montserrat's widest digit.
 */
export function fitFontSize(chars: number, max: string) {
  return `min(${max}, 100cqw / ${(Math.max(chars, 1) * 0.65).toFixed(2)})`;
}

/**
 * `amount` in atomic units (zatoshi, satoshi, …) as a decimal string in whole
 * units, for a token with `decimals` decimals: no trailing zeros, no exponent.
 */
export function atomicToWhole(
  amount: bigint,
  decimals: number,
  fixed: boolean = false,
): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;

  const atomicsPerWhole = 10n ** BigInt(decimals);
  const whole = abs / atomicsPerWhole;
  const frac = abs % atomicsPerWhole;

  let fracStr = frac.toString().padStart(decimals, "0");
  if (decimals === 0 || !fixed) fracStr = fracStr.replace(/0+$/, "");
  const result = fracStr ? `${whole}.${fracStr}` : `${whole}`;

  return negative ? `-${result}` : result;
}

/** Convert zatoshi (bigint) → ZEC decimal string. */
export function zatoshiToZec(zatoshi: bigint): string {
  return atomicToWhole(zatoshi, DECIMALS);
}

/**
 * `amount`, typed or a number, split into its sign, whole digits and
 * fraction digits. Numbers are written out in full first, never with an
 * exponent. Throws if it isn't a plain decimal.
 */
function splitDecimal(amount: string | number) {
  const str =
    typeof amount === "number"
      ? amount.toLocaleString("en-US", {
          useGrouping: false,
          maximumFractionDigits: 20,
        })
      : amount.trim();

  if (!/^-?\d*\.?\d*$/.test(str) || str === "" || str === "." || str === "-") {
    throw new Error(`Invalid amount: "${amount}"`);
  }

  const negative = str.startsWith("-");
  const [whole = "0", frac = ""] = str.replace(/^-/, "").split(".");
  return { negative, whole, frac };
}

/**
 * `amount` in whole units as atomic units, for a token with `decimals`
 * decimals. Throws if it isn't a decimal or has more fraction digits.
 */
export function wholeToAtomic(
  amount: string | number,
  decimals: number,
): bigint {
  const { negative, whole, frac } = splitDecimal(amount);

  if (frac.length > decimals) {
    throw new Error(`Too many decimals: at most ${decimals}`);
  }

  const atomicsPerWhole = 10n ** BigInt(decimals);
  const atomic =
    BigInt(whole) * atomicsPerWhole + BigInt(frac.padEnd(decimals, "0"));

  return negative ? -atomic : atomic;
}

// Represents a big integer divided by ten to the power of the exponent
export type Scaled = readonly [bigint, number];

/**
 * `amount` as an exact scaled integer: `[n, scale]`, with `amount` equal to
 * `n / 10^scale` and `scale` however many fraction digits it has. For prices,
 * whose precision varies.
 */
export function wholeToScaledBigInt(amount: string | number): Scaled {
  const { negative, whole, frac } = splitDecimal(amount);

  const scaled =
    BigInt(whole) * 10n ** BigInt(frac.length) + BigInt(frac || "0");

  return [negative ? -scaled : scaled, frac.length];
}

// Convert scaled bigint to whole
export function scaledBigIntToWhole(
  scaled: Scaled,
  fixed: boolean = false,
): string {
  return atomicToWhole(scaled[0], scaled[1], fixed);
}

// Multiply two scaled bigints
export function scaledBigIntMul(a: Scaled, b: Scaled): Scaled {
  return [a[0] * b[0], a[1] + b[1]];
}

// Divide two scaled bigints
export function scaledBigIntDiv(
  a: Scaled,
  b: Scaled,
  precision: number,
): Scaled {
  return [
    (a[0] * 10n ** BigInt(b[1] + precision)) / (b[0] * 10n ** BigInt(a[1])),
    precision,
  ];
}

// Scale a scaled bigint
export function scaledBigIntScale(a: Scaled, precision: number): Scaled {
  return [(a[0] * 10n ** BigInt(precision)) / 10n ** BigInt(a[1]), precision];
}

// Add two scaled bigints
export function scaledBigIntAdd(a: Scaled, b: Scaled): Scaled {
  const decimals = Math.max(a[1], b[1]);
  const c = a[0] * 10n ** BigInt(decimals - a[1]);
  const d = b[0] * 10n ** BigInt(decimals - b[1]);
  return [c + d, decimals];
}

// Subtract two scaled bigints
export function scaledBigIntSub(a: Scaled, b: Scaled): Scaled {
  const decimals = Math.max(a[1], b[1]);
  const c = a[0] * 10n ** BigInt(decimals - a[1]);
  const d = b[0] * 10n ** BigInt(decimals - b[1]);
  return [c - d, decimals];
}

/** Convert ZEC (string or number) → zatoshi (bigint). */
export function zecToZatoshi(zec: string | number): bigint {
  return wholeToAtomic(zec, DECIMALS);
}

/** `text` with any digits past ZEC's 8 decimals cut off. */
export function capDecimals(text: string): string {
  return text.replace(new RegExp(`(\\.\\d{${DECIMALS}})\\d+`), "$1");
}

export function singleton<T>(fn: () => Promise<T>): () => Promise<T> {
  let instance: Promise<T> | undefined;
  return () =>
    (instance ??= fn().catch((err: unknown) => {
      // Failed, so the next call tries again rather than failing for good.
      instance = undefined;
      throw err;
    }));
}

export function dedupe<T>(fn: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | undefined;
  return () => {
    if (!inflight) {
      inflight = fn().finally(() => {
        inflight = undefined;
      });
    }
    return inflight;
  };
}

export const shortenAddress = (
  address: string,
  prefixLength = 8,
  suffixLength = 6,
  delimiter = "...",
): string => {
  if (address.length <= prefixLength + suffixLength) {
    return address;
  }
  const prefix = address.substring(0, prefixLength);
  const suffix = address.substring(
    address.length - suffixLength,
    address.length,
  );
  return [prefix, delimiter, suffix].join("");
};

export function transactionValue(
  tx: Pick<Activity, "tx_type" | "value" | "fee" | "self">,
) {
  let value = tx.value;
  // Sent values come back negative; flip to positive for display.
  if (tx.tx_type === "Sent") {
    value *= -1n;
  }
  // Shielded values exclude the fee; add it back for the total amount.
  if (tx.tx_type === "Shielded") {
    value += tx.fee;
  }

  // Received and sent are the balance's ups and downs; the rest moves money
  // between the account's own pools, so they carry no sign. Nor does a
  // self-payment: signed by its fee, a small one would read as a loss.
  const signal =
    tx.tx_type === "Received"
      ? "+"
      : tx.tx_type === "Sent" && !tx.self
        ? "−"
        : "";

  return { signal, value };
}
