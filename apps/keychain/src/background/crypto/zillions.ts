/**
 * Background Zillions SDK bindings: PCZT parsing, signing, and summary building.
 * Address derivation lives in the page façade, not here.
 *
 * This is the background's second wasm module (next to @zillions/crypto):
 * signing must run here so the revealed seed never leaves the worker.
 */
import initWasm, {
  Pczt,
  pczt_sign,
  SeedFingerprint,
  UnifiedSpendingKey
} from "@zillions-sdk/keys";
import type { PcztSummary, PcztTransparentIo } from "@zillions/types";
import { bigintReplacer } from "@zillions/utils";

export type { Pczt } from "@zillions-sdk/keys";

let initialized: Promise<unknown> | undefined;

/**
 * Initialize the @zillions-sdk/keys wasm module. Idempotent.
 * Must be awaited before any PCZT call. (Same default-URL resolution the
 * setup-tab façade uses: the bundler emits the wasm as an asset.)
 */
export const initZillionsSdk = (): Promise<unknown> => {
  return (initialized ??= initWasm());
};

/**
 * Resolve the Zillions SDK network string ("main" | "test") from the build env,
 * exactly like `src/wallet` does for address derivation.
 */
export const getNetwork = (): string => {
  const chainId = process.env.Z_INTERFACE_ZCASH_CHAIN_ID ?? "";
  return chainId.toLowerCase().includes("test") ? "test" : "main";
};

/**
 * Boundary encoding helpers. A PCZT crosses the IPC boundary (provider <->
 * background) as base64-encoded postcard bytes. Chunked conversion keeps
 * large PCZTs off the call stack.
 */
const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

const base64ToBytes = (s: string): Uint8Array => {
  const binary = atob(s);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
};

export const pcztToBase64 = (pczt: Pczt): string =>
  bytesToBase64(pczt.serialize());

export const pcztFromBase64 = (s: string): Pczt =>
  Pczt.from_bytes(base64ToBytes(s));

/**
 * Sign a PCZT with the unified spending key derived from `seed` at `hdIndex`.
 *
 * Wires `@zillions-sdk/keys` `pczt_sign`. The offline signer matches spends
 * to the key across transparent/sapling/orchard and adds signatures.
 */
export const signPczt = async (
  pczt: Pczt,
  seed: Uint8Array,
  hdIndex: number
): Promise<Pczt> => {
  const network = getNetwork();
  const usk = new UnifiedSpendingKey(network, seed, hdIndex);
  const seedFp = new SeedFingerprint(seed);
  // Don't call .free() (null pointer): pczt_sign takes ownership of all three WASM args via __destroy_into_raw
  return pczt_sign(network, pczt, usk, seedFp);
};

/** A Bitcoin/Zcash signed-message result (see `signArbitraryWithKey`). */
export type ArbitrarySignature = {
  /** 32-byte double-SHA256 digest of the wrapped message, hex. */
  hash: string;
  /** 65-byte Bitcoin-style `[header||r||s]` recoverable signature, base64. */
  signature: string;
  /** Compressed secp256k1 public key (33 bytes) of the signing key, hex. */
  publicKey: string;
};

/**
 * Sign an arbitrary message with the transparent secp256k1 key derived from
 * `seed` at `hdIndex` (external index 0). Bitcoin/Zcash "signed message"
 * format — interoperable with `zcashd verifymessage`. See the Rust binding
 * `UnifiedSpendingKey::sign_arbitrary`.
 */
export const signArbitraryWithKey = (
  seed: Uint8Array,
  hdIndex: number,
  message: string
): ArbitrarySignature => {
  const usk = new UnifiedSpendingKey(getNetwork(), seed, hdIndex);
  try {
    const [hash, signature, publicKey] = usk.sign_arbitrary(message).split(":");
    return { hash, signature, publicKey };
  } finally {
    usk.free();
  }
};

/**
 * Verify a signed-message signature against an expected compressed public key.
 * Pure public-key crypto (recovers the signer and compares) — no secret. See
 * the Rust binding `UnifiedSpendingKey::verify_arbitrary`.
 */
export const verifyArbitrary = (
  publicKey: string,
  hash: string,
  signature: string
): boolean => UnifiedSpendingKey.verify_arbitrary(publicKey, hash, signature);

/**
 * Compute the ZIP-32 seed fingerprint for a seed as a lowercase hex string.
 * Safe to store publicly — it identifies the seed without revealing it.
 */
export const computeSeedFingerprint = (seed: Uint8Array): string => {
  const fp = new SeedFingerprint(seed);
  try {
    return Array.from(fp.to_bytes())
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } finally {
    fp.free();
  }
};

/** Both encodings of an account's spending secret (see `spendingKeys`). */
export type SpendingKeys = {
  /**
   * The full unified spending key (transparent + Sapling + Orchard), as the
   * librustzcash byte encoding hex. Complete and account-scoped, but
   * non-canonical — not importable by other wallets.
   */
  orchard: string;
  /**
   * The Sapling extended spending key, Bech32 (`secret-extended-key-main1…`).
   * A standard, portable/importable encoding — but Sapling pool ONLY.
   */
  sapling: string;
};

/**
 * Derive both spending-key encodings from `seed` at `hdIndex`. Backs the
 * popup's "Spending Key" reveal, which shows the Sapling and Orchard forms
 * side by side. Account-scoped: does NOT reveal the seed phrase or siblings.
 */
export const spendingKeys = (
  seed: Uint8Array,
  hdIndex: number
): SpendingKeys => {
  const network = getNetwork();
  const usk = new UnifiedSpendingKey(network, seed, hdIndex);
  try {
    return {
      orchard: usk.to_bytes_hex(),
      sapling: usk.sapling_extended_spending_key(network),
    };
  } finally {
    usk.free();
  }
};

/**
 * Build a human-readable summary from a PCZT's `to_json()` structure.
 *
 * The exact JSON shape produced by Zillions SDK is not part of a stable contract,
 * so this reads defensively: it pulls transparent inputs/outputs,
 * sapling/orchard value flows, and a fee where present, and always keeps the
 * full `to_json()` for the raw expandable view. Anything we are not sure
 * about is simply surfaced through `raw`.
 */
export const buildPcztSummary = (pczt: Pczt): PcztSummary => {
  // Stringify converts the WASM object to a plain JS object and coerces BigInts to strings in one pass.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = JSON.parse(JSON.stringify(pczt.to_json(), bigintReplacer)) as any;
  const asArray = (v: unknown): unknown[] =>
    Array.isArray(v) ? v : v ? [v] : [];

  const transparent = json?.transparent ?? {};
  const sapling = json?.sapling ?? {};
  const orchard = json?.orchard ?? {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapIo = (item: any): PcztTransparentIo => {
    const recipient =
      item?.recipient_address ?? item?.address ?? item?.recipient ?? undefined;
    const value =
      item?.value ?? item?.value_sum ?? item?.note?.value ?? undefined;
    return { ...item, address: recipient, value };
  };

  const fee =
    json?.fee !== undefined ? String(json.fee)
    : transparent?.fee !== undefined ? String(transparent.fee)
    : json?.global?.fee !== undefined ? String(json.global.fee)
    : undefined;

  return {
    network: json?.network ?? json?.global?.network ?? getNetwork(),
    transparentInputs: asArray(transparent?.inputs).map(mapIo),
    transparentOutputs: asArray(transparent?.outputs).map(mapIo),
    saplingInputs: asArray(sapling?.spends).map(mapIo),
    saplingOutputs: asArray(sapling?.outputs).map(mapIo),
    orchardInputs: asArray(orchard?.spends ?? orchard?.actions).map(mapIo),
    orchardOutputs: asArray(orchard?.outputs ?? orchard?.actions).map(mapIo),
    fee,
    raw: json,
  };
};
