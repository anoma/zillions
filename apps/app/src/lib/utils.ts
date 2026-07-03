const ZATOSHI_PER_ZEC = 100_000_000n;
const DECIMALS = 8;

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

export const isTransparentAddress = (s: string): boolean => s.startsWith("t");

export const isShieldedAddress = (s: string): boolean => s.startsWith("u");
