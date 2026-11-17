/**
 * PCZT (Partially Created Zcash Transaction) provider types.
 *
 * PCZTs cross the provider <-> background boundary as base64-encoded postcard
 * bytes (the output of `pczt.serialize()`). For display, the background derives
 * a JSON summary from `pczt.to_json()`.
 */

/**
 * A base64-encoded PCZT (the postcard serialization produced by
 * `pczt.serialize()`).
 */
export type PcztBase64 = string;

/**
 * A single transparent input/output as surfaced by `pczt.to_json()`.
 * Fields are best-effort: the Zillions SDK JSON structure is rendered as-is, so we
 * only type the values we reliably read.
 */
export type PcztTransparentIo = {
  address?: string;
  value?: string | number;
  /**
   * Outputs only: true when the signing account's viewing key proves the
   * output comes back to it (change); false for a payment.
   */
  mine?: boolean;
  /** Outputs of ours only: the address's scope (0 external, 1 internal) and index. */
  path?: TransparentPath;
  // Anything else present in the JSON is kept for the raw view.
  [key: string]: unknown;
};

export type TransparentPath = { scope: number; index: number };

/**
 * A shielded (sapling/orchard/ironwood) value flow as surfaced by `pczt.to_json()`.
 */
export type PcztShieldedIo = {
  address?: string;
  value?: string | number;
  /** Outputs only: see `PcztTransparentIo.mine`. */
  mine?: boolean;
  [key: string]: unknown;
};

/**
 * A human-readable summary of a PCZT, derived from `pczt.to_json()` in the
 * background and rendered by the approval UI.
 */
export type PcztSummary = {
  /** Network the PCZT targets ("main" | "test"), if present. */
  network?: string;
  /** Transparent inputs. */
  transparentInputs: PcztTransparentIo[];
  /** Transparent outputs. */
  transparentOutputs: PcztTransparentIo[];
  /** Sapling value flows (spends + outputs). */
  saplingInputs: PcztShieldedIo[];
  saplingOutputs: PcztShieldedIo[];
  /** Orchard value flows (spends + outputs/actions). */
  orchardInputs: PcztShieldedIo[];
  orchardOutputs: PcztShieldedIo[];
  /** Ironwood value flows (spends + outputs/actions). */
  ironwoodInputs: PcztShieldedIo[];
  ironwoodOutputs: PcztShieldedIo[];
  /** Fee in zatoshis, derived from the PCZT's bundle balances. */
  fee: string;
  /**
   * Its one payment funds a payment link this Keychain sealed: the amount
   * includes the claim fee.
   */
  paymentLink?: boolean;
  /**
   * Every transparent output of ours past the addresses wallets scan: one
   * restoring the recovery phrase may never find the money they hold.
   */
  unusualChange?: (TransparentPath & { value: string })[];
  /** The full `to_json()` structure for the raw expandable view. */
  raw: unknown;
};
