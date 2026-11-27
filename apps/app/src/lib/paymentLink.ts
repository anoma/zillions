// Payment links: product.md 2.10, docs/design/payment-links.md.
import { MEMO_BYTES, utf8Length } from "./memo";
import { zatoshiToZec, zecToZatoshi } from "./utils";

/** Paid along with the link, so the claimer receives exactly its amount. */
export const CLAIM_FEE = 10_000n;

const VERSION = 1;
const MAGIC = [0xff, ...new TextEncoder().encode("PAYLINK")];

// The link's memo carries a 73-byte header (0xFF, "PAYLINK", version, nk,
// sealed link key) before the description.
export const DESCRIPTION_BYTES = MEMO_BYTES - 73;

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const fromHex = (hex: string) =>
  Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16));

/** The funding memo, hex: `0xFF | "PAYLINK" | version | nk | sealed key | description`. */
export function linkMemo(nk: string, sealed: Uint8Array, description: string) {
  if (utf8Length(description) > DESCRIPTION_BYTES) {
    throw new Error("Description is too long");
  }
  const memo = new Uint8Array([
    ...MAGIC,
    VERSION,
    ...fromHex(nk),
    ...sealed,
    ...new TextEncoder().encode(description),
  ]);
  return toHex(memo);
}

/** Unpadded base64url: the link key sits in a URL. */
function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string) {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export type ClaimLink = {
  key: Uint8Array;
  /** What the link says it holds; the chain's note has the last word. */
  amount: bigint;
  treeSize: number;
  network: string;
  description: string;
  /** When the funding was approved, unix seconds; absent from older links. */
  createdAt?: number;
};

/** How long a funding may take to show on-chain before the claim page gives up on it. */
export const FUNDING_GRACE_MS = 5 * 60_000;

/** A link's fragment (`#v=1&k=…`) read back, or undefined if it isn't one. */
export function parseLink(fragment: string): ClaimLink | undefined {
  const fields = new URLSearchParams(fragment.replace(/^#/, ""));
  const [v, k, a, s, n] = ["v", "k", "a", "s", "n"].map((f) => fields.get(f));
  if (v !== String(VERSION) || !k || !a || !s || !n) return undefined;
  try {
    const key = fromBase64Url(k);
    const treeSize = Number(s);
    const t = fields.get("t");
    const createdAt = t === null ? undefined : Number(t);
    if (key.length !== 32 || !Number.isSafeInteger(treeSize)) return undefined;
    if (createdAt !== undefined && !Number.isSafeInteger(createdAt)) {
      return undefined;
    }
    return {
      key,
      amount: zecToZatoshi(a),
      treeSize,
      network: n,
      description: fields.get("d") ?? "",
      ...(createdAt !== undefined && { createdAt }),
    };
  } catch {
    return undefined;
  }
}

/**
 * The link to share. Everything is in the fragment, which browsers never send
 * to a server.
 */
export function linkUrl({
  base,
  key,
  amount,
  treeSize,
  network,
  description,
  createdAt,
}: {
  /** The app's own URL, ending in "/". */
  base: string;
  key: Uint8Array;
  /** What the claimer receives, without the claim fee. */
  amount: bigint;
  /** Ironwood's tree size before funding: the note lands at or after it. */
  treeSize: number;
  network: string;
  description: string;
  createdAt: number;
}) {
  const fields = new URLSearchParams({
    v: String(VERSION),
    k: base64Url(key),
    a: zatoshiToZec(amount),
    s: String(treeSize),
    n: network,
    t: String(createdAt),
  });
  if (description) fields.set("d", description);
  return `${base}claim#${fields}`;
}
