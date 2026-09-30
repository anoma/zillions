/**
 * Zcash keys from a seed, via `@zillions/zcore`: the account's viewing key
 * and default addresses, the seed fingerprint, and the spending-key reveal.
 * Offline key math, used by the setup tab and the background alike.
 *
 * Signing transactions returns with zcore's transaction building.
 */
import initZcore, {
  derive_account,
  seed_fingerprint,
  spending_keys,
} from "@zillions/zcore";

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
