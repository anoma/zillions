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
 * background/keyring); no Ledger.
 *
 * SENDER GATING: `dapp/*` channels are the ONLY ones reachable from content
 * scripts (i.e. from web pages); their origin always comes from the message
 * sender, never the payload. Every other channel is restricted to trusted
 * extension pages (popup/setup/approvals). See `background/server.ts`.
 */
import type { PcztSummary, ZCashKeychainAccount } from "@zillions/types";

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

export type AccountType = "mnemonic" | "private-key" | "shielded-keys";

/** The flow that produced an account. */
export type AccountFlow = "create" | "import";

/** Secret material the user supplies during onboarding. */
export type AccountSecret =
  | { t: "Mnemonic"; seedPhrase: string[]; passphrase: string }
  | { t: "PrivateKey"; privateKey: string }
  | { t: "ShieldedKeys"; spendingKey: string };

/** A stored parent account (transparent or shielded), as returned to the UI. */
export type AccountStore = {
  id: string;
  alias: string;
  address: string;
  owner: string;
  type: AccountType;
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
       * Key material derived OFFLINE in the setup tab by the wallet façade
       * (@zillions-sdk/keys). Persisted so storage reflects the real
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
    };
    res: DerivedAccount;
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
  /** Public account records (parents + shielded children); requires connection. */
  "dapp/accounts": {
    req: Record<string, never>;
    res: ZCashKeychainAccount[];
  };
  /** The active account, or null when none is set; requires connection. */
  "dapp/defaultAccount": {
    req: Record<string, never>;
    res: ZCashKeychainAccount | null;
  };
  /**
   * Ask to make `address` the active/default account. Resolves once the user
   * approves in the popup; requires connection and an unlocked vault.
   */
  "dapp/updateDefaultAccount": {
    req: { address: string };
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
  // --- approvals (trusted UIs only: the approval popup + settings) ---
  /** Whether `origin` is already approved (approval popup auto-approve check). */
  "approvals/isConnectionApproved": {
    req: { origin: string };
    res: boolean;
  };
  /** Resolve the pending connection request owned by the calling popup's tab. */
  "approvals/resolveConnection": {
    req: { origin: string; allow: boolean };
    res: void;
  };
  /** Resolve the pending disconnection request owned by the calling popup's tab. */
  "approvals/resolveDisconnection": {
    req: { origin: string; revoke: boolean };
    res: void;
  };
  /** All currently approved origins (Connected Sites screen). */
  "approvals/connectedSites": {
    req: Record<string, never>;
    res: string[];
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
  /** Confirm the pending sign request owned by the calling popup's tab. */
  "approvals/submitSignTx": {
    req: { msgId: string; signer: string };
    res: void;
  };
  /** Reject the pending sign request owned by the calling popup's tab. */
  "approvals/rejectSignTx": {
    req: { msgId: string };
    res: void;
  };
  /**
   * Confirm the pending default-account change owned by the calling popup's
   * tab: sets `address` active and settles the dapp's request.
   */
  "approvals/submitUpdateDefaultAccount": {
    req: { address: string };
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
