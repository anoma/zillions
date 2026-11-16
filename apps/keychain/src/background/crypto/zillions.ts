/**
 * Zcash keys from a seed, via `@zillions/zcore`: the account's viewing key
 * and default addresses, the seed fingerprint, the spending-key reveal, and
 * PCZT signing. Offline key math, used by the setup tab and the background.
 */
import initZcore, {
  apply_ledger_signatures,
  combine_pczts,
  derive_account,
  derive_account_from_ufvk,
  fresh_address,
  gap_limits,
  link_info,
  open_link_key,
  pczt_keystone_fw_version,
  pczt_ledger_transaction,
  pczt_summary,
  seal_link_key,
  seed_fingerprint,
  sign_pczt,
  spending_keys,
} from "@zillions/zcore";
import type { PcztTransaction } from "@ledgerhq/device-signer-kit-zcash";
import type { PcztSummary } from "@zillions/types";
import browser from "webextension-polyfill";

let initialized: Promise<unknown> | undefined;

/** Initialize the zcore wasm module. Idempotent; await before any call. */
export const initZillionsSdk = (): Promise<unknown> => {
  // Copied by the `build:publicAssets` hook in wxt.config.ts.
  return (initialized ??= initZcore({
    module_or_path: browser.runtime.getURL("/wasm/zcore_bg.wasm"),
  }));
};

/**
 * Resolve the network string ("main" | "test") from the build env
 * (`Z_INTERFACE_ZCASH_CHAIN_ID` like "zcash.testnet"), defaulting to mainnet.
 */
export const getNetwork = (): "main" | "test" => {
  const chainId = process.env.Z_INTERFACE_ZCASH_CHAIN_ID ?? "";
  return chainId.toLowerCase().includes("test") ? "test" : "main";
};

/**
 * Addresses in a row past the last one used that wallets restoring a phrase
 * check, per transparent scope (0 external, 1 internal): upstream
 * zcash_keys' defaults. zcore never counts another scope as the account's.
 */
export const transparentGapLimits = (): Record<number, number> => {
  const { external, internal } = gap_limits() as { external: number; internal: number };
  return { 0: external, 1: internal };
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

/** The account a device's UFVK export names: same keys, no seed. */
export const deriveAccountFromUfvk = async (
  ufvk: string
): Promise<DerivedKeys> => {
  await initZillionsSdk();
  return derive_account_from_ufvk(getNetwork(), ufvk);
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

/** The address a payment link's key (base64) holds its note at. */
export const linkAddress = (key: string): string =>
  (link_info(getNetwork(), base64ToBytes(key)) as { address: string }).address;

/** A payment link's key (base64) sealed to the seed's account `hdIndex`. */
export const sealLinkKey = (
  key: string,
  seed: Uint8Array,
  hdIndex: number
): string =>
  bytesToBase64(seal_link_key(getNetwork(), seed, hdIndex, base64ToBytes(key)));

const hexToBytes = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16));

/** A payment link's key, base64, from its seal and `nk` (both hex). */
export const openLinkKey = (
  sealed: string,
  nk: string,
  seed: Uint8Array,
  hdIndex: number
): string =>
  bytesToBase64(
    open_link_key(getNetwork(), seed, hdIndex, hexToBytes(sealed), hexToBytes(nk))
  );

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
 * A device's signatures over a PCZT, hex, in the order the Ledger signer kit
 * returns them: one per Orchard and per Ironwood spend the PCZT leaves
 * unsigned, one per transparent input (DER, then the sighash type byte).
 * Only the device module and this façade know the shape — over the IPC
 * boundary the signing output travels as an opaque `deviceData` string.
 */
export type LedgerSignatures = {
  orchard: string[];
  ironwood: string[];
  transparent: string[];
};

/**
 * A Keystone's firmware version ("13.0.8" — the device displays major minus
 * 10), from the stamp its signed PCZT responses carry. Undefined when the
 * response has no readable stamp: firmware too old to report it.
 */
export const keystoneFwVersion = async (
  pczt: string
): Promise<string | undefined> => {
  await initZillionsSdk();
  return pczt_keystone_fw_version(base64ToBytes(pczt));
};

/**
 * `pczt` (base64) with a device's signatures in; throws if one doesn't sign
 * it. The binding signatures are the app's to add when it extracts.
 */
export const applyDeviceSignatures = (
  pczt: string,
  signatures: LedgerSignatures
): string =>
  bytesToBase64(apply_ledger_signatures(base64ToBytes(pczt), signatures));

/**
 * `pczt1` (base64, what a Keystone scanned back: signatures, but not the
 * proof keys) merged into `pczt0` (the keyring's full copy). Throws if they
 * aren't the same transaction.
 */
export const combinePczts = async (
  pczt0: string,
  pczt1: string
): Promise<string> => {
  await initZillionsSdk();
  return bytesToBase64(
    combine_pczts(base64ToBytes(pczt0), base64ToBytes(pczt1))
  );
};
