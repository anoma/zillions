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
  // Disposable
  Disposable: "disposable",
};

export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export type DerivedAccount = {
  id: string;
  address: string;
  owner?: string;
  publicKey?: string;
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

export type Account = Pick<
  DerivedAccount,
  | "address"
  | "alias"
  | "type"
  | "publicKey"
  | "owner"
  | "pseudoExtendedKey"
  | "source"
  | "timestamp"
  | "diversifierIndex"
> & {
  viewingKey?: string;
};

export type ZCashKeychainAccount = Account & {
  id: string;
  parentId?: string;
  /** ZIP-32 account index used to derive this account's keys. */
  hdIndex: number;
  /** ZIP-32 seed fingerprint (hex). Empty string for accounts with no seed. */
  seedFingerprint: string;
  /** Block height at which this account was created/imported. Used to skip scanning earlier blocks. */
  birthday: number;
};

/**
 * ViewingKey with optional birthday
 */
export type DatedViewingKey = {
  key: string;
  birthday: number;
};
