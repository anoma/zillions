/**
 * Typed IPC contract between the UI (setup tab) and the background service
 * worker.
 *
 * SECURITY: the UI and wallet logic run in separate realms with separate
 * memory. Secrets (seed phrase, spending keys, decrypted vault) must live ONLY
 * in the background, so every privileged action crosses `runtime.sendMessage`.
 *
 * The contract is one discriminated union keyed by `kind`, pairing each
 * channel's request and response types, so `BackgroundClient.send` infers the
 * response from the request, the dispatcher is exhaustively checked, and
 * responses are validated at runtime (see `validate.ts`).
 *
 * Scope: Setup flow + popup + the dapp connection lifecycle. Wallet
 * persistence is the real encrypted vault (background/vault +
 * background/keyring); no secret material crosses here.
 *
 * SENDER GATING: `dapp/*` channels are the ONLY ones reachable from content
 * scripts (i.e. from web pages); their origin always comes from the message
 * sender, never the payload. Every other channel is restricted to trusted
 * extension pages (popup/setup/approvals). See `background/server.ts`.
 */
import type {
  AccountInfo,
  ClaimLinkProps,
  CompactChunk,
  DecryptCompactProps,
  DecryptFullProps,
  FullChunk,
  PcztSummary,
  ProvedTx,
  SendTxProps,
  TransparentAddressesProps,
  SiteAccount,
} from "@zillions/types";

// ---------------------------------------------------------------------------
// Domain types (declared locally to avoid importing background/*; the
// dapp-facing account shape comes from @zillions/types since dapps consume it).
// ---------------------------------------------------------------------------

export type Bip44Path = {
  account: number;
  change: number;
  index: number;
};

export type Zip32Path = {
  account: number;
  index?: number;
};

export type AccountType =
  | "mnemonic"
  | "private-key"
  | "shielded-keys"
  | "ledger"
  | "viewing-key";

/** The flow that produced an account. */
export type AccountFlow = "create" | "import";

/** Secret material the user supplies during onboarding. */
export type AccountSecret =
  | { t: "Mnemonic"; seedPhrase: string[]; passphrase: string }
  | { t: "PrivateKey"; privateKey: string }
  | { t: "ShieldedKeys"; spendingKey: string };

/** Which hardware wallet an account's keys live on. */
export type DeviceKind = "ledger" | "keystone" | "passkey-prf";

/** A passkey credential at rest: its id (base64url) and the RP it was made
 * under, plus its COSE public key (base64) when the credential was created
 * here. An imported credential carries no public key — WebAuthn never
 * re-reveals one for an existing credential — so its record holds the id
 * and RP alone. Only the passkey module interprets it; the keychain
 * stores it as-is. */
export type DeviceCredential = {
  id: string;
  rpId: string;
  publicKey?: string;
};

/** A pending PCZT for a device account, its kind and the account's ZIP-32 index. */
export type DeviceSignTx = {
  device: DeviceKind;
  pczt: string;
  hdIndex: number;
  /** The passkey credential to assert with, when the account's is one. */
  credentialId?: string;
};

/** A stored parent account (transparent or shielded), as returned to the UI. */
export type AccountStore = {
  id: string;
  alias: string;
  address: string;
  owner: string;
  type: AccountType;
  /** The hardware wallet the keys live on, if any. */
  device?: DeviceKind;
  path: Bip44Path;
  parentId?: string;
  source: "imported" | "generated";
  timestamp: number;
};

/** A derived (child) account, e.g. the shielded account under a parent. */
export type DerivedAccount = {
  id: string;
  alias: string;
  address: string;
  type: AccountType;
  device?: DeviceKind;
  parentId?: string;
};

/**
 * A persisted account record as surfaced to the popup. Mirrors the stored
 * `KeyStoreType` minus the derivation `path` (its stored shape doesn't fit
 * `Bip44Path` for shielded children, and the popup's list/detail screens don't
 * need it).
 */
export type StoredAccount = {
  id: string;
  alias: string;
  address: string;
  /** For a transparent parent: its address. For a shielded account: the UFVK. */
  owner: string;
  type: AccountType;
  /** The hardware wallet the keys live on, if any. */
  device?: DeviceKind;
  /** Set on derived (child) accounts; absent on parents. */
  parentId?: string;
  source: "imported" | "generated";
  timestamp: number;
};

/** Pointer to the active (parent) account. */
export type ActiveAccount = {
  id: string;
  type: AccountType;
};

/** A connected origin and the wallet (parent account) it currently sees. */
export type ConnectedSite = {
  origin: string;
  accountId: string;
};

/** Vault lock snapshot the popup gates on. */
export type LockState = {
  passwordInitialized: boolean;
  isLocked: boolean;
};

/** A shielded account's spending secret, in both encodings. */
export type SpendingKeys = {
  /** Unified spending key (transparent+Sapling+Orchard) hex — non-portable. */
  orchard: string;
  /** Sapling extended spending key, Bech32 (`secret-extended-key-main1…`). */
  sapling: string;
};

/** Outcome of a password reset, serialized across the IPC boundary. */
export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; error: "bad-password" | "keystore" };

/** What an approval request asked for. */
export type ApprovalKind =
  | "connect"
  | "disconnect"
  | "sign"
  | "default-account"
  | "open-link";

/** One decision taken in an approval window, as the Keychain recorded it. */
export type ApprovalLogEntry = {
  id: string;
  /** Milliseconds since the epoch. */
  at: number;
  origin: string;
  kind: ApprovalKind;
  /** "closed": the window was closed without an answer. */
  outcome: "approved" | "rejected" | "closed" | "failed";
  /** Zatoshi leaving the account, for a signed transaction. */
  amount?: string;
  /** First recipient's address, for a signed transaction. */
  to?: string;
  /** The account the request concerned, by name. */
  account?: string;
};

export type MnemonicValidation = {
  isValid: boolean;
  /** Present when invalid. `invalidWordIndex` is set for a bad word. */
  error?: string;
  invalidWordIndex?: number;
};

// ---------------------------------------------------------------------------
// Request/response contract
// ---------------------------------------------------------------------------

/** Every channel is one entry: a `req` payload type and a `res` result type. */
export type IpcContract = {
  // --- vault ---
  "vault/isPasswordInitialized": {
    req: Record<string, never>;
    res: boolean;
  };
  /** Whether the browser deleted a vault this install had created. */
  "vault/lost": {
    req: Record<string, never>;
    res: boolean;
  };
  "vault/createPassword": {
    req: { password: string };
    res: void;
  };
  "vault/lockState": {
    req: Record<string, never>;
    res: LockState;
  };
  "vault/unlock": {
    req: { password: string };
    res: boolean;
  };
  "vault/lock": {
    req: Record<string, never>;
    res: void;
  };
  /** Re-verify the password (does not change lock state); for sensitive actions. */
  "vault/checkPassword": {
    req: { password: string };
    res: boolean;
  };
  /** Re-encrypt the vault under a new password (requires the current one). */
  "vault/resetPassword": {
    req: { oldPassword: string; newPassword: string };
    res: ResetPasswordResult;
  };
  /** Whether the 30-minute auth window expired (password re-check needed). */
  "vault/requiresAuth": {
    req: Record<string, never>;
    res: boolean;
  };

  // --- settings ---
  /** Minutes of system idle time before the Keychain locks; 0 never. */
  "settings/getAutoLock": {
    req: Record<string, never>;
    res: number;
  };
  "settings/setAutoLock": {
    req: { minutes: number };
    res: void;
  };
  /** Whether connected sites may sync while the Keychain is locked. */
  "settings/getSyncWhileLocked": {
    req: Record<string, never>;
    res: boolean;
  };
  "settings/setSyncWhileLocked": {
    req: { on: boolean };
    res: void;
  };

  // --- keyring ---
  "keyring/generateMnemonic": {
    req: { size: 12 | 24 };
    res: string[];
  };
  "keyring/validateMnemonic": {
    req: { phrase: string };
    res: MnemonicValidation;
  };
  "keyring/saveAccountSecret": {
    req: {
      accountSecret: AccountSecret;
      alias: string;
      flow: AccountFlow;
      path: Bip44Path;
      /**
       * Key material derived OFFLINE in the setup tab by @zillions/zcore.
       * Persisted so storage reflects the real
       * receivers / viewing key rather than re-deriving in the (vault) backend.
       */
      transparentAddress: string;
      shieldedAddress: string;
      /** Encoded UFVK (`uview1…`) — the account's viewing key (NOT a public key). */
      viewingKey: string;
      /** Block height at which this account was created/imported. */
      birthday: number;
    };
    res: AccountStore;
  };
  "keyring/deriveShieldedAccount": {
    req: {
      parentId: string;
      alias: string;
      path: Zip32Path;
      source: "imported" | "generated";
      /** Shielded (unified/orchard) receiver derived offline by the façade. */
      shieldedAddress: string;
      /** Encoded UFVK (`uview1…`) — stored as the derived account's owner. */
      viewingKey: string;
      /** Block height at which the parent account was created/imported. */
      birthday: number;
      /** Set when the keys live on a hardware wallet, not in the vault. */
      device?: DeviceKind;
    };
    res: DerivedAccount;
  };
  /**
   * Store a hardware-wallet account with its shielded child, and make it
   * active. Re-connecting an already imported device just re-activates
   * it. The keys stay on the device or derive per ceremony — no secret
   * ever arrives here.
   */
  "keyring/saveDeviceAccount": {
    req: {
      device: DeviceKind;
      alias: string;
      bip44Path: Bip44Path;
      zip32Path: Zip32Path;
      /**
       * The device's addresses. Optional for devices that don't hand them
       * over (derived from the viewing key instead); today's all do.
       */
      transparentAddress?: string;
      shieldedAddress?: string;
      /** Encoded UFVK (`uview1…`) read from the device. */
      viewingKey: string;
      /** ZIP-32 seed fingerprint (hex) the PCZT's zip32_derivation carries. */
      seedFingerprint: string;
      birthday: number;
      /** The WebAuthn credential, for passkey accounts. */
      credential?: DeviceCredential;
    };
    res: {
      parentAccount: AccountStore;
      shieldedAccount?: DerivedAccount;
      alreadyImported: boolean;
    };
  };
  "keyring/queryAccounts": {
    req: Record<string, never>;
    res: StoredAccount[];
  };
  "keyring/getActiveAccount": {
    req: Record<string, never>;
    res: ActiveAccount | null;
  };
  "keyring/setActiveAccount": {
    req: { id: string; type: AccountType };
    res: void;
  };
  /** Reveal the seed phrase of a mnemonic account (vault must be unlocked). */
  "keyring/revealMnemonic": {
    req: { accountId: string };
    res: string;
  };
  /** Reveal the spending keys (Sapling Bech32 + unified hex) of a shielded account. */
  "keyring/revealSpendingKey": {
    req: { accountId: string };
    res: SpendingKeys;
  };
  "keyring/renameAccount": {
    req: { accountId: string; alias: string };
    res: StoredAccount;
  };
  "keyring/deleteAccount": {
    req: { accountId: string };
    res: void;
  };

  // --- dapp (relayed by the content script; reachable from web pages) ---
  // The dapp's origin is derived from the message sender in the background —
  // these payloads are deliberately empty so a page can't spoof another origin.
  /** Ask to connect this origin; resolves once approved, rejects on deny. */
  "dapp/connect": {
    req: Record<string, never>;
    res: void;
  };
  /** Ask to disconnect this origin (no-op when it was never approved). */
  "dapp/disconnect": {
    req: Record<string, never>;
    res: void;
  };
  /** Whether this origin is approved AND the vault is unlocked. */
  "dapp/isConnected": {
    req: Record<string, never>;
    res: boolean;
  };
  /** Whether the vault is locked; false unless this origin is approved. */
  "dapp/isLocked": {
    req: Record<string, never>;
    res: boolean;
  };
  /** The wallet this origin is connected with and its shielded child; requires connection. */
  "dapp/account": {
    req: Record<string, never>;
    res: SiteAccount | null;
  };
  /**
   * Have the user pick the site's wallet in the popup. Resolves once they
   * confirm; requires connection and an unlocked vault.
   */
  "dapp/switchAccount": {
    req: Record<string, never>;
    res: void;
  };
  /**
   * Sign a PCZT (base64 postcard bytes in/out). Resolves once the user
   * approves in the popup; requires connection and an unlocked vault.
   */
  "dapp/sign": {
    req: { pczt: string; signer?: string };
    res: string;
  };
  /**
   * Seal a payment link's key (base64) to the connected account; no approval,
   * as sealing opens nothing. Requires connection and an unlocked vault.
   */
  "dapp/sealLinkKey": {
    req: { key: string };
    res: string;
  };
  /**
   * Open a payment link's sealed key (hex) once the user approves in the
   * popup; resolves with the key, base64. Requires connection and an unlocked
   * vault.
   */
  "dapp/openLinkKey": {
    req: { sealed: string; nk: string };
    res: string;
  };
  /**
   * Trial-decrypt a chunk the site fetched with its shielded account's key,
   * which never leaves the Keychain. Requires connection and an unlocked vault.
   */
  "dapp/decryptCompact": {
    req: DecryptCompactProps;
    res: CompactChunk;
  };
  /** Read a chunk's hits in full, and what the account sent in it. */
  "dapp/decryptFull": {
    req: DecryptFullProps;
    res: FullChunk;
  };
  /** The shielded account's pools, shown transparent index and storage key. */
  "dapp/accountInfo": {
    req: { account?: string };
    res: AccountInfo;
  };
  /** A new shielded address of the account. */
  "dapp/freshAddress": {
    req: { account?: string };
    res: string;
  };
  /** A range of the account's transparent addresses. */
  "dapp/transparentAddresses": {
    req: TransparentAddressesProps;
    res: string[];
  };
  /**
   * Build a transaction from the site's wallet snapshot, have the user
   * approve and sign it in the popup, and prove it; resolves with it, ready
   * to broadcast.
   */
  "dapp/sendTransaction": {
    req: SendTxProps;
    res: ProvedTx;
  };
  /** Build and prove a payment link's claim into the site's account; no popup. */
  "dapp/claimLink": {
    req: ClaimLinkProps;
    res: ProvedTx;
  };
  // --- approvals (trusted UIs only: the approval popup + settings) ---
  /** Whether `origin` is already approved (approval popup auto-approve check). */
  "approvals/isConnectionApproved": {
    req: { origin: string };
    res: boolean;
  };
  /**
   * Resolve the pending connection request owned by the calling popup's tab;
   * `accountId` is the wallet to connect with.
   */
  "approvals/resolveConnection": {
    req: { origin: string; allow: boolean; accountId?: string };
    res: void;
  };
  /** Resolve the pending disconnection request owned by the calling popup's tab. */
  "approvals/resolveDisconnection": {
    req: { origin: string; revoke: boolean };
    res: void;
  };
  /** Connected origins and their wallets (Connected Sites screen). */
  "approvals/connectedSites": {
    req: Record<string, never>;
    res: ConnectedSite[];
  };
  /** Revoke a previously approved origin (Connected Sites screen). */
  "approvals/revokeConnection": {
    req: { origin: string };
    res: void;
  };
  /** Display summary of the pending PCZT parked under `msgId`. */
  "approvals/queryPcztSummary": {
    req: { msgId: string };
    res: PcztSummary;
  };
  /**
   * The pending PCZT under `msgId` when a hardware wallet signs it — the
   * popup has the device sign; null for any other account.
   */
  "approvals/queryDeviceSignTx": {
    req: { msgId: string };
    res: DeviceSignTx | null;
  };
  /**
   * Confirm the pending sign request owned by the calling popup's tab. A
   * device account's request carries the device's signing output, opaque:
   * its engine interprets (and verifies) it keyring-side.
   */
  "approvals/submitSignTx": {
    req: { msgId: string; signer: string; deviceData?: string };
    res: void;
  };
  /** Reject the pending sign request owned by the calling popup's tab. */
  "approvals/rejectSignTx": {
    req: { msgId: string };
    res: void;
  };
  /**
   * Confirm the pending "show a payment link again" request `msgId`, owned by
   * the calling popup's tab: opens the key and settles the dapp's request.
   */
  "approvals/submitOpenLinkKey": {
    req: { msgId: string; password: string };
    res: void;
  };
  /**
   * Confirm the pending account switch owned by the calling popup's tab: the
   * site moves to wallet `accountId` and the dapp's request settles.
   */
  "approvals/submitSwitchAccount": {
    req: { accountId: string };
    res: void;
  };
  /** Approval decisions, newest first (vault must be unlocked). */
  "approvals/log": {
    req: Record<string, never>;
    res: ApprovalLogEntry[];
  };
  "approvals/clearLog": {
    req: Record<string, never>;
    res: void;
  };
};

/** All valid channel keys. */
export type IpcKind = keyof IpcContract;

/** The request payload for a given channel. */
export type IpcRequest<K extends IpcKind> = IpcContract[K]["req"];

/** The response type for a given channel. */
export type IpcResponse<K extends IpcKind> = IpcContract[K]["res"];

/**
 * A fully-formed envelope sent over the wire. `kind` is the discriminant the
 * background dispatcher switches on; `payload` is the typed request body.
 */
export type IpcMessage<K extends IpcKind = IpcKind> = {
  kind: K;
  payload: IpcRequest<K>;
};

/** Result envelope returned from the background (success XOR error). */
export type IpcResult<K extends IpcKind = IpcKind> =
  | { ok: true; value: IpcResponse<K> }
  | { ok: false; error: { message: string; stack?: string } };

/** Helper to build a typed message envelope. */
export const message = <K extends IpcKind>(
  kind: K,
  payload: IpcRequest<K>
): IpcMessage<K> => ({ kind, payload });
