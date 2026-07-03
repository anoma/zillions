/**
 * Wallet façade types.
 *
 * The façade turns a seed phrase into Zcash addresses, FULLY OFFLINE (pure key
 * math via `@zillions-sdk/keys` — librustzcash `default_address`; no
 * lightwalletd, no sync, no wallet DB). Runs in the setup tab.
 */
import type { UnifiedFullViewingKey } from "@zillions-sdk/keys";

/** Zcash network the addresses are encoded for. */
export type ZcashNetwork = "main" | "test";

/**
 * A derived account: one seed + one ZIP-32 hd index. A single account's UFVK
 * yields BOTH a transparent receiver and a shielded (unified/orchard) receiver
 * — two views of the same key, not two separate accounts.
 */
export type AccountRef = {
  /** ZIP-32 hierarchical-deterministic account index. */
  hdIndex: number;
  /** The account's unified full viewing key (addresses are derived from it). */
  ufvk: UnifiedFullViewingKey;
};

/** Transparent (t-address) receiver. */
export type TransparentAddress = {
  kind: "transparent";
  address: string;
};

/** Shielded receiver — the unified address carrying the orchard receiver. */
export type ShieldedAddress = {
  kind: "shielded";
  /** Canonical unified-address encoding (orchard + sapling + transparent). */
  address: string;
};

/**
 * The wallet façade.
 *
 * `createAccount` derives the account's UFVK from the seed phrase; the address
 * getters are split into `createTransparent` / `createShielded`, each encoding
 * its receiver from that UFVK. Mnemonic gen/validation is NOT here — see the
 * crypto module; the façade's concern is address derivation.
 */
export interface ZcashWallet {
  /** Derive the account (UFVK) for `seedPhrase` at `hdIndex`. */
  createAccount(seedPhrase: string, hdIndex: number): Promise<AccountRef>;

  /** Encode the transparent receiver for a derived account. */
  createTransparent(account: AccountRef): Promise<TransparentAddress>;

  /** Encode the shielded (unified/orchard) receiver for a derived account. */
  createShielded(account: AccountRef): Promise<ShieldedAddress>;

  /**
   * The account's encoded Unified Full Viewing Key (`uview1…`) — a VIEWING key
   * (it lets the holder see shielded activity), NOT a public key and NOT an
   * address.
   */
  viewingKey(account: AccountRef): string;
}
