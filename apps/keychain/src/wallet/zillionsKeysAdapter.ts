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
 *     → ufvk.get_external_transparent_address(network)  (BIP-44 m/44'/133'/0'/0/0)
 *     → ufvk.get_unified_address(network)               (orchard+sapling UA)
 *
 * NOTE: `from_seed_phrase`, `get_unified_address`, and
 * `get_external_transparent_address` are custom bindings added to the Zillions SDK
 * keys source at build time (see scripts/build-zillions-sdk-keys.sh); the published
 * @zillions-sdk/keys has none of them. (`get_unified_address` uses the
 * `SHIELDED` request and the external-transparent binding uses index 0, so both
 * match the addresses standard Zcash wallets display.)
 */
import initWasm, { UnifiedSpendingKey } from "@zillions-sdk/keys";

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
    // Standard BIP-44 external receive address (m/44'/133'/0'/0/0) — the t-addr
    // other wallets display — NOT Zillions SDK' get_transparent_address (which returns
    // the transparent receiver of the default unified address, at its diversifier
    // index, so it differs from every standard wallet).
    const address = account.ufvk.get_external_transparent_address(this.network);
    if (address == null) {
      throw new Error("UFVK has no transparent receiver");
    }
    return { kind: "transparent", address };
  }

  async createShielded(account: AccountRef): Promise<ShieldedAddress> {
    const address = account.ufvk.get_unified_address(this.network);
    return { kind: "shielded", address };
  }

  publicKey(account: AccountRef): string {
    // The transparent secp256k1 public key (compressed hex) behind the index-0
    // external t-address — the account's real public key, NOT the UFVK.
    return account.ufvk.get_external_transparent_pubkey() ?? "";
  }

  viewingKey(account: AccountRef): string {
    return account.ufvk.encode(this.network);
  }
}
