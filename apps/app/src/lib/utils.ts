import type { Activity } from "./wallet/types";

const ZATOSHI_PER_ZEC = 100_000_000n;
const DECIMALS = 8;

/**
 * ZIP 318's `MAX_RESIDUAL_VALUE` (0.01 ZEC): less than this stays in Orchard,
 * since moving a distinctive dust amount would single the wallet out.
 */
export const MIGRATION_MINIMUM = ZATOSHI_PER_ZEC / 100n;

/** Hides Move to Ironwood (2.9) until it has been tested: `VITE_MIGRATION_ENABLED=true` shows it. */
export const MIGRATION_ENABLED =
  import.meta.env.VITE_MIGRATION_ENABLED === "true";

/**
 * CSS font size that fits `chars` characters in the nearest `@container`,
 * never above `max`. 0.65em is Montserrat's widest digit.
 */
export function fitFontSize(chars: number, max: string) {
  return `min(${max}, 100cqw / ${(Math.max(chars, 1) * 0.65).toFixed(2)})`;
}

/** Convert zatoshi (bigint) → ZEC decimal string. */
export function zatoshiToZec(zatoshi: bigint): string {
  const negative = zatoshi < 0n;
  const abs = negative ? -zatoshi : zatoshi;

  const whole = abs / ZATOSHI_PER_ZEC;
  const frac = abs % ZATOSHI_PER_ZEC;

  const fracStr = frac.toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  const result = fracStr ? `${whole}.${fracStr}` : `${whole}`;

  return negative ? `-${result}` : result;
}

/** Convert ZEC (string or number) → zatoshi (bigint). */
export function zecToZatoshi(zec: string | number): bigint {
  const str = typeof zec === "number" ? zec.toString() : zec.trim();

  if (!/^-?\d*\.?\d*$/.test(str) || str === "" || str === "." || str === "-") {
    throw new Error(`Invalid ZEC amount: "${zec}"`);
  }

  const negative = str.startsWith("-");
  const [whole = "0", frac = ""] = str.replace(/^-/, "").split(".");

  if (frac.length > DECIMALS) {
    throw new Error(`Too many decimals: ZEC supports max ${DECIMALS}`);
  }

  const fracPadded = frac.padEnd(DECIMALS, "0");
  const zatoshi = BigInt(whole) * ZATOSHI_PER_ZEC + BigInt(fracPadded);

  return negative ? -zatoshi : zatoshi;
}

export function singleton<T>(fn: () => Promise<T>): () => Promise<T> {
  let instance: Promise<T> | undefined;
  return () => (instance ??= fn());
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
  tx: Pick<Activity, "tx_type" | "value" | "fee">,
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

  let signal = "";
  // Prefix received amounts with + to show the balance increase.
  if (tx.tx_type === "Received") {
    signal = "+";
  }

  return { signal, value };
}
