/**
 * Wallet façade entry point. `getZcashWallet()` resolves the single offline
 * façade (backed by `@zillions-sdk/keys`); call it from the setup tab.
 *
 * NOTE: `@zillions-sdk/keys` is a vendored package built from Zillions SDK source
 * with custom address bindings — run `npm run build:zillions-sdk` to produce it.
 */
import type { ZcashNetwork, ZcashWallet } from "./types";
import { ZillionsKeysAdapter } from "./zillionsKeysAdapter";

export type {
  AccountRef,
  ShieldedAddress,
  TransparentAddress,
  ZcashNetwork,
  ZcashWallet,
} from "./types";

let cached: ZcashWallet | undefined;

/**
 * Resolve the network from the build env (`Z_INTERFACE_ZCASH_CHAIN_ID` like
 * "zcash.testnet" / "zcash.mainnet"), defaulting to mainnet.
 */
const resolveNetwork = (): ZcashNetwork => {
  const chainId = process.env.Z_INTERFACE_ZCASH_CHAIN_ID ?? "";
  return chainId.toLowerCase().includes("test") ? "test" : "main";
};

/** Get the singleton wallet façade (wasm is lazily initialized on first use). */
export const getZcashWallet = (): ZcashWallet => {
  if (!cached) {
    cached = new ZillionsKeysAdapter(resolveNetwork());
  }
  return cached;
};

/** Reset the cached wallet (tests). */
export const _resetWallet = (): void => {
  cached = undefined;
};
