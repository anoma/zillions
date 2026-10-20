/**
 * Zcash keys from a seed, via `@zillions/zcore`: the account's viewing key
 * and default addresses, the seed fingerprint, the spending-key reveal, and
 * PCZT signing. Offline key math, used by the setup tab and the background.
 */
import initZcore, {
  apply_ledger_signatures,
  derive_account,
  fresh_address,
  pczt_ledger_transaction,
  pczt_summary,
  seed_fingerprint,
  sign_pczt,
  spending_keys,
} from "@zillions/zcore";
import type { PcztTransaction } from "@ledgerhq/device-signer-kit-zcash";
import type { PcztSummary } from "@zillions/types";

import type { LedgerSignatures } from "../../ipc/contract";

let initialized: Promise<unknown> | undefined;

/** Initialize the zcore wasm module. Idempotent; await before any call. */
export const initZillionsSdk = (): Promise<unknown> => {
  return (initialized ??= initZcore());
};

/**
 * Resolve the network string ("main" | "test") from the build env
 * (`Z_INTERFACE_ZCASH_CHAIN_ID` like "zcash.testnet"), defaulting to mainnet.
 */
export const getNetwork = (): "main" | "test" => {
  const chainId = process.env.Z_INTERFACE_ZCASH_CHAIN_ID ?? "";
  return chainId.toLowerCase().includes("test") ? "test" : "main";
};

/** An account's public side: what the app is given to watch it. */
export type DerivedKeys = {
  /** Encoded UFVK (`uview1…`): a viewing key, not a public key. */
  ufvk: string;
  /** The default address's transparent receiver. */
  transparent?: string;
  /** The default unified address, Orchard + Sapling. */
  unified: string;
};

/** The account at ZIP-32 index `hdIndex` of `seed`. */
export const deriveAccount = async (
  seed: Uint8Array,
  hdIndex: number
): Promise<DerivedKeys> => {
  await initZillionsSdk();
  return derive_account(getNetwork(), seed, hdIndex);
};

/**
 * A new shielded address of the account `ufvk` names, unlinkable to its
 * others. From the viewing key alone: no password, no network.
 */
export const freshAddress = async (ufvk: string): Promise<string> => {
  await initZillionsSdk();
  return fresh_address(getNetwork(), ufvk);
};

/**
 * Compute the ZIP-32 seed fingerprint for a seed as a lowercase hex string.
 * Safe to store publicly — it identifies the seed without revealing it.
 */
export const computeSeedFingerprint = (seed: Uint8Array): string =>
  seed_fingerprint(seed);

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
export const spendingKeys = (seed: Uint8Array, hdIndex: number): SpendingKeys =>
  spending_keys(getNetwork(), seed, hdIndex);

/**
 * A PCZT crosses the IPC boundary (provider <-> background) as base64-encoded
 * bytes. Chunked conversion keeps large PCZTs off the call stack.
 */
const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

const base64ToBytes = (s: string): Uint8Array =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/**
 * Signs every input of `pczt` (base64) that the seed's account `hdIndex`
 * holds, transparent and shielded alike; throws if it holds none.
 */
export const signPczt = (
  pczt: string,
  seed: Uint8Array,
  hdIndex: number
): string =>
  bytesToBase64(sign_pczt(getNetwork(), base64ToBytes(pczt), seed, hdIndex));

/**
 * What a PCZT (base64) moves, for the approval screen. Shielded inputs are
 * per-pool totals; each output is `mine` when `ufvk`, the signing account's
 * viewing key, proves it lands back in the account.
 */
export const buildPcztSummary = async (
  pczt: string,
  ufvk: string
): Promise<PcztSummary> => {
  await initZillionsSdk();
  const summary = pczt_summary(getNetwork(), base64ToBytes(pczt), ufvk);
  return { ...summary, raw: summary };
};

/**
 * `pczt` (base64) as a Ledger's Zcash app reads it, for the account at
 * ZIP-32 index `hdIndex`. Throws on Sapling, which a Ledger can't sign.
 */
export const ledgerTransaction = (
  pczt: string,
  hdIndex: number
): PcztTransaction =>
  pczt_ledger_transaction(
    getNetwork(),
    base64ToBytes(pczt),
    hdIndex
  ) as PcztTransaction;

/**
 * `pczt` (base64) with a Ledger's signatures in; throws if one doesn't sign
 * it. The binding signatures are the app's to add when it extracts.
 */
export const applyLedgerSignatures = (
  pczt: string,
  signatures: LedgerSignatures
): string =>
  bytesToBase64(apply_ledger_signatures(base64ToBytes(pczt), signatures));
