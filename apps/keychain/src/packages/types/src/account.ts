export type Bip44Path = {
  account: number;
  change: number;
  index: number;
};

export type Zip32Path = {
  account: number;
  index?: number;
};

// Generic type for storing either Bip44 or Zip32 path
export type Path = {
  account: number;
  change?: number;
  index?: number;
};

// Type of account for storage
export const AccountType = {
  // A stored mnemonic phrase
  Mnemonic: "mnemonic",
  // A stored private key
  PrivateKey: "private-key",
  // Stored, stringified spending and viewing keys
  ShieldedKeys: "shielded-keys",
  // Ledger account
  Ledger: "ledger",
  // Watch-only account backed by a viewing key (e.g. a hardware wallet's)
  ViewingKey: "viewing-key",
  // Disposable
  Disposable: "disposable",
} as const;

export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export type DerivedAccount = {
  id: string;
  address: string;
  owner?: string;
  alias: string;
  parentId?: string;
  path: Path;
  type: AccountType;
  modifiedZip32Path?: string;
  pseudoExtendedKey?: string;
  source?: "imported" | "generated";
  timestamp?: number;
  diversifierIndex?: number;
};

/**
 * A dapp-facing account: only ever the one the site is connected with, or
 * its derived children. None carries its viewing key, which the Keychain
 * uses on the site's behalf.
 * It never says how the keys are held or came to be (phrase, Ledger,
 * passkey; generated or imported): a hijacked site would use that to
 * pick its targets.
 */
export type ZCashKeychainAccount = {
  id: string;
  alias: string;
  address: string;
  parentId?: string;
  /** ZIP-32 account index used to derive this account's keys. */
  hdIndex?: number;
  /** ZIP-32 seed fingerprint (hex). Random for accounts with no seed in the Keychain. */
  seedFingerprint?: string;
  /** Block height at which this account was created/imported. Used to skip scanning earlier blocks. */
  birthday?: number;
};

/** The account a site is connected with: its wallet and that wallet's shielded child. */
export type SiteAccount = {
  transparent: ZCashKeychainAccount;
  shielded: ZCashKeychainAccount;
};

/**
 * ViewingKey with optional birthday
 */
export type DatedViewingKey = {
  key: string;
  birthday: number;
};
