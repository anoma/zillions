import type { Activity } from "./wallet/types";

const ZATOSHI_PER_ZEC = 100_000_000n;
const DECIMALS = 8;

/**
 * ZIP 318's `MAX_RESIDUAL_VALUE` (0.01 ZEC): less than this stays in Orchard,
 * since moving a distinctive dust amount would single the wallet out.
 */
export const MIGRATION_MINIMUM = ZATOSHI_PER_ZEC / 100n;

/** About how long until block `height`, from `tip`, at 75 seconds a block. */
export function fromNow(tip: number, height: number) {
  const minutes = ((height - tip) * 75) / 60;
  if (minutes < 5) return "now";
  if (minutes < 90) return `~${Math.round(minutes)} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `~${hours} hours` : `~${Math.round(hours / 24)} days`;
}

/** The local clock time of block `height`, from `tip`, at 75 seconds a block; with the weekday when it isn't today. */
export function clockAt(tip: number, height: number) {
  const when = new Date(Date.now() + (height - tip) * 75_000);
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

/** `text` with any digits past ZEC's 8 decimals cut off. */
export function capDecimals(text: string): string {
  return text.replace(new RegExp(`(\\.\\d{${DECIMALS}})\\d+`), "$1");
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
