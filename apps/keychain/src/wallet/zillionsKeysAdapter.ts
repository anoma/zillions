/**
 * `@zillions-sdk/keys` adapter — the wallet façade implementation.
 *
 * Fully offline: derives addresses with pure key math (librustzcash
 * `default_address`), no network or wallet DB.
 *
 * Derivation path (all in one wasm):
 *   seed phrase
 *     → UnifiedSpendingKey.from_seed_phrase(network, phrase, hdIndex)
 *     → .to_unified_full_viewing_key()                (the AccountRef's `ufvk`)
 *     → ufvk.get_transparent_address(network)  (BIP-44 m/44'/133'/0'/0/<j>, see below)
 *     → ufvk.get_unified_address(network)      (orchard+sapling UA)
 *
 * NOTE: `from_seed_phrase` and `get_unified_address` are custom bindings added
 * to the Zillions SDK keys source at build time (see
 * scripts/build-zillions-sdk-keys.sh); the published @zillions-sdk/keys has
 * none of them. (`get_unified_address` uses the `SHIELDED` request, matching
 * the UA standard Zcash wallets display.)
 */
import initWasm, { UnifiedSpendingKey } from "@zillions/sdk/keys";

import type {
  AccountRef,
  ShieldedAddress,
  TransparentAddress,
  ZcashNetwork,
  ZcashWallet,
} from "./types";

// `initWasm()` must be called once per page load.
let wasmReady: Promise<unknown> | undefined;
const initOnce = (): Promise<unknown> => {
  return (wasmReady ??= initWasm());
};

export class ZillionsKeysAdapter implements ZcashWallet {
  constructor(private readonly network: ZcashNetwork) {}

  async createAccount(seedPhrase: string, hdIndex: number): Promise<AccountRef> {
    await initOnce();
    const usk = UnifiedSpendingKey.from_seed_phrase(
      this.network,
      seedPhrase,
      hdIndex
    );
    try {
      const ufvk = usk.to_unified_full_viewing_key();
      return { hdIndex, ufvk };
    } finally {
      // The USK holds secret material; free it once the (public) UFVK is out.
      usk.free();
    }
  }

  async createTransparent(account: AccountRef): Promise<TransparentAddress> {
    // Transparent receiver of the default unified address — m/44'/133'/0'/0/<j>,
    // where j is the lowest diversifier index with a valid sapling diversifier
    // (seed-dependent, usually 0). Matches the t-addr Zodl/Zashi display.
    const address = account.ufvk.get_transparent_address(this.network);
    if (address == null) {
      throw new Error("UFVK has no transparent receiver");
    }
    return { kind: "transparent", address };
  }

  async createShielded(account: AccountRef): Promise<ShieldedAddress> {
    const address = account.ufvk.get_unified_address(this.network);
    return { kind: "shielded", address };
  }

  viewingKey(account: AccountRef): string {
    return account.ufvk.encode(this.network);
  }
}
