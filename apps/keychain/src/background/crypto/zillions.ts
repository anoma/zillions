/**
 * Background Zillions SDK bindings: PCZT parsing, signing, and summary building.
 * Address derivation lives in the page façade, not here.
 *
 * This is the background's second wasm module (next to @zillions/crypto):
 * signing must run here so the revealed seed never leaves the worker.
 */
import initWasm, {
  Pczt,
  type PcztJson,
  pczt_sign,
  SeedFingerprint,
  UnifiedSpendingKey
} from "zillions-sdk/keys";
import type { PcztSummary, PcztTransparentIo } from "@zillions/types";
import { jsonify } from "@zillions/utils";

export type { Pczt } from "zillions-sdk/keys";

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
 * Build a human-readable summary from a PCZT's `to_json()` structure (typed as
 * `PcztJson`, see `@zillions-sdk/keys`).
 *
 * Transparent and Sapling spends/outputs are flat entries with their own `value`/
 * `user_address` fields. Orchard bundles a spend and an output together into each
 * `action`, so `role` picks which side of the action to read - the two sides
 * legitimately carry different values (what's being consumed vs. what's newly
 * created), so listing both is correct, not duplicative.
 *
 * Fields not read here are still surfaced through `raw` for the expandable view.
 * The fee is read via `pczt.fee()` instead of anything in this JSON, since it's a
 * stable method on the shared `Pczt` wasm type rather than a JSON field.
 */
export const buildPcztSummary = (pczt: Pczt): PcztSummary => {
  // Read directly off the typed `PcztJson` - none of the fields this function extracts
  // (`user_address`, `value`) are ever bigint, so there's no need for `jsonify`'s
  // bigint-to-string pass here. `jsonify` is used once below, only for `raw`, which does
  // need to be JSON-safe (it crosses the IPC boundary to the approval popup and includes
  // `sapling.value_sum`, the one field in this shape that's a real bigint).
  const pcztJson: PcztJson = pczt.to_json();
  const asArray = <T>(v: T | T[] | undefined): T[] =>
    Array.isArray(v) ? v : v ? [v] : [];

  const transparent = pcztJson.transparent ?? {};
  const sapling = pcztJson.sapling ?? {};
  const orchard = pcztJson.orchard ?? {};

  const mapIo = (
    item: Record<string, unknown>,
    role: "spend" | "output",
  ): PcztTransparentIo => {
    // Orchard actions nest spend/output data under `item[role]`; transparent and
    // Sapling entries are already flat, so `item[role]` isn't an object and we
    // fall back to reading `item` itself.
    const nested = item[role];
    const source =
      typeof nested === "object" && nested !== null
        ? (nested as Record<string, unknown>)
        : item;
    const address =
      typeof source.user_address === "string" ? source.user_address : undefined;
    const value =
      typeof source.value === "number" || typeof source.value === "string"
        ? source.value
        : undefined;
    return { ...item, address, value };
  };

  const fee = String(pczt.fee());

  return {
    network: getNetwork(),
    transparentInputs: asArray(transparent.inputs).map((i) => mapIo(i, "spend")),
    transparentOutputs: asArray(transparent.outputs).map((i) => mapIo(i, "output")),
    saplingInputs: asArray(sapling.spends).map((i) => mapIo(i, "spend")),
    saplingOutputs: asArray(sapling.outputs).map((i) => mapIo(i, "output")),
    orchardInputs: asArray(orchard.actions).map((i) => mapIo(i, "spend")),
    orchardOutputs: asArray(orchard.actions).map((i) => mapIo(i, "output")),
    fee,
    raw: jsonify(pcztJson),
  };
};
