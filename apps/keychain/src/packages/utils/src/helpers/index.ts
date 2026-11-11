/**
 * Dependency-free helpers used by the extension and component library.
 */

/**
 * Map parameters to a route definition, returning formatted route string
 */
export const formatRoute = (
  route: string,
  params: { [key: string]: string | number }
): string => {
  let formatted = route;

  for (const param in params) {
    formatted = formatted.replace(`:${param}`, `${params[param]}`);
  }

  return formatted;
};

/**
 * Format absolute React Router paths
 */
export const formatRouterPath = (routes: string[]): string =>
  `/${routes.join("/")}`;

/**
 * Get URL params
 */
export const getParams = (
  prop?: string
): string | { [key: string]: string } => {
  const urlSearchParams = new URLSearchParams(window.location.search);
  const params = Object.fromEntries(urlSearchParams.entries());
  return prop ? params[prop] : params;
};

/**
 * Get timestamp
 */
export const getTimeStamp = (): number => Math.floor(Date.now() / 1000);

/*
 * Shorten a Bech32 address
 */
export const shortenAddress = (
  address: string,
  prefixLength = 8,
  suffixLength = 6,
  delimiter = "..."
): string => {
  if (address.length <= prefixLength + suffixLength) {
    return address;
  }
  const prefix = address.substring(0, prefixLength);
  const suffix = address.substring(
    address.length - suffixLength,
    address.length
  );
  return [prefix, delimiter, suffix].join("");
};

export const truncateInMiddle = (
  str: string,
  firstCharCount = str.length,
  endCharCount = 0
): string => {
  return (
    str.substring(0, firstCharCount) +
    "…" +
    str.substring(str.length - endCharCount, str.length)
  );
};

/**
 * Assert that a value is of type `never`, the type with no possible values.
 */
// eslint-disable-next-line
export const assertNever = (error: never): never => {
  throw new Error(`This should never happen: ${error}`);
};

export type Ok<T> = { ok: true; value: T };
export type Err<E> = { ok: false; error: E };

/**
 * Result type used to indicate success or failure.
 */
export type Result<T, E> = Ok<T> | Err<E>;

export const Result = {
  ok: function <T>(value: T): Ok<T> {
    return { ok: true as const, value };
  },

  err: function <E>(error: E): Err<E> {
    return { ok: false as const, error };
  },
};

/**
 * Pick object parameters
 */
export function pick<T, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> {
  return keys.reduce(
    (acc, val) => {
      return (acc[val] = obj[val]), acc;
    },
    {} as Pick<T, K>
  );
}

/**
 * Format url with query string params using an object
 */
export function paramsToUrl(
  url: string,
  params: Record<string, string>
): string {
  const queryString = new URLSearchParams(params).toString();

  if (queryString) {
    return `${url}?${queryString}`;
  }
  return url;
}

/**
 * Applies a function to a value that is possibly undefined.
 */
export const mapUndefined = <A, B>(
  transform: (value: A) => B,
  input: A | undefined
): B | undefined => (input !== undefined ? transform(input) : undefined);

export const isEmptyObject = (object: Record<string, unknown>): boolean => {
  return Object.keys(object).length === 0;
};

/** Rejects when the browser refuses the write (e.g. the page isn't focused). */
export const copyToClipboard = async (value: string): Promise<void> => {
  if (typeof navigator === "undefined") {
    throw new Error("No clipboard here");
  }
  await navigator.clipboard.writeText(value);
};

export const matchMapFn = (
  key: string,
  objMap: Record<string, () => void>
): void => {
  if (objMap.hasOwnProperty(key)) {
    objMap[key]();
    return;
  }
};

/**
 * Check that an input url is valid
 */
export const isUrlValid = (url: string): boolean => {
  try {
    const newUrl = new URL(url);
    return ["http:", "https:", "ws:", "wss:"].includes(newUrl.protocol);
  } catch {
    return false;
  }
};

/**
 * Sanitize the url removing leading and trailing spaces as well the trailing slash
 */
export const sanitizeUrl = (url: string): string => {
  const trimmedUrl = url.trim();
  return trimmedUrl.endsWith("/") ? trimmedUrl.slice(0, -1) : url;
};

/** JSON replacer that serializes BigInt values as strings, since JSON.stringify can't handle BigInt natively. */
export const bigintReplacer = (_: string, v: unknown): unknown =>
  typeof v === "bigint" ? v.toString() : v;

/**
 * Type-level counterpart of `bigintReplacer`: the shape of `T` after
 * `JSON.parse(JSON.stringify(value, bigintReplacer))`, i.e. every `bigint`
 * recursively replaced with `string`. Note this widens fixed-length tuples
 * (e.g. `[bigint, boolean]`) to arrays, since JSON round-tripping doesn't
 * preserve tuple arity at the type level.
 */
export type Jsonify<T> = T extends bigint
  ? string
  : T extends readonly (infer U)[]
    ? Jsonify<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;

/**
 * Deep-clones `value` into a plain, JSON-safe object via `bigintReplacer`,
 * converting every `bigint` into a `string` in the process. Useful for turning
 * a wasm-bindgen result (which may carry BigInts and live wasm-memory views)
 * into an independent plain object safe to store or pass across an IPC boundary.
 */
export const jsonify = <T>(value: T): Jsonify<T> =>
  JSON.parse(JSON.stringify(value, bigintReplacer));

const ZATOSHI_PER_ZEC = 100_000_000n;
const ZEC_DECIMALS = 8;

/** Convert zatoshi (bigint, or its number/string form off the IPC boundary) → ZEC decimal string. */
export const zatoshiToZec = (zatoshi: bigint | number | string): string => {
  const value = typeof zatoshi === "bigint" ? zatoshi : BigInt(zatoshi);
  const negative = value < 0n;
  const abs = negative ? -value : value;

  const whole = abs / ZATOSHI_PER_ZEC;
  const frac = abs % ZATOSHI_PER_ZEC;

  const fracStr = frac
    .toString()
    .padStart(ZEC_DECIMALS, "0")
    .replace(/0+$/, "");
  const result = fracStr ? `${whole}.${fracStr}` : `${whole}`;

  return negative ? `-${result}` : result;
};
