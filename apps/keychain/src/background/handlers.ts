/**
 * Background handlers: one per IPC channel, typed against the contract. The map
 * is exhaustive — every `IpcKind` must have a handler or this file won't
 * compile.
 *
 * Handlers delegate to the real vault/keyring services (`./services`).
 */
import type {
  AccountType,
  IpcKind,
  IpcRequest,
  IpcResponse,
  StoredAccount,
} from "../ipc/contract";
import type { KeyStoreType } from "../storage";
import { applyAutoLock } from "./autoLock";
import { deviceOf } from "./keyring/types";
import { getServices } from "./services";
import { ResetPasswordError } from "./vault";

/** Project a stored vault record onto the popup-facing `StoredAccount`. */
const toStoredAccount = (a: KeyStoreType): StoredAccount => ({
  id: a.id,
  alias: a.alias,
  address: a.address,
  owner: a.owner,
  type: a.type as AccountType,
  device: deviceOf(a),
  parentId: a.parentId,
  source: a.source as StoredAccount["source"],
  timestamp: a.timestamp,
});

/**
 * Who sent the envelope, derived from `runtime.onMessage`'s sender by the
 * server — never from the payload, so a web page cannot spoof it.
 */
export type IpcSenderContext = {
  /** True when the sender is one of our extension pages (popup/setup/approvals). */
  trusted: boolean;
  /** The web origin of the dapp page (content-script senders only). */
  origin?: string;
  /** The sender's tab id (approval popups resolve their request with it). */
  tabId?: number;
};

/** Context used when dispatching in-process (tests/mocks): fully trusted. */
export const TRUSTED_SENDER: IpcSenderContext = { trusted: true };

const requireOrigin = (ctx: IpcSenderContext): string => {
  if (!ctx.origin) {
    throw new Error("Missing sender origin for dapp channel");
  }
  return ctx.origin;
};

const requireTabId = (ctx: IpcSenderContext): number => {
  if (ctx.tabId === undefined) {
    throw new Error("Missing sender tab id for approval resolution");
  }
  return ctx.tabId;
};

/** Far above any real PCZT; bounds what a page can park in worker memory. */
const MAX_PCZT_BASE64_LENGTH = 2 * 1024 * 1024;

/** A handler maps a typed request payload to a typed response (sync or async). */
export type Handler<K extends IpcKind> = (
  payload: IpcRequest<K>,
  ctx: IpcSenderContext
) => IpcResponse<K> | Promise<IpcResponse<K>>;

export type HandlerMap = {
  [K in IpcKind]: Handler<K>;
};

export const handlers: HandlerMap = {
  "vault/isPasswordInitialized": async () => {
    const { vaultService } = await getServices();
    return vaultService.passwordInitialized();
  },

  "vault/createPassword": async ({ password }) => {
    const { vaultService, localStorage } = await getServices();
    await vaultService.createPassword(password);
    await localStorage.noteVaultCreated();
  },

  "vault/lost": async () => {
    const { localStorage } = await getServices();
    return localStorage.vaultLost();
  },

  "vault/lockState": async () => {
    const { vaultService } = await getServices();
    const [passwordInitialized, isLocked] = await Promise.all([
      vaultService.passwordInitialized(),
      vaultService.isLocked(),
    ]);
    return { passwordInitialized, isLocked };
  },

  "vault/unlock": async ({ password }) => {
    const { vaultService, broadcaster } = await getServices();
    const unlocked = await vaultService.unlock(password);
    if (unlocked) void broadcaster.unlocked();
    return unlocked;
  },

  "vault/lock": async () => {
    const { vaultService, broadcaster } = await getServices();
    await vaultService.lock();
    void broadcaster.locked();
  },

  "vault/checkPassword": async ({ password }) => {
    const { vaultService } = await getServices();
    return vaultService.checkPassword(password);
  },

  "vault/requiresAuth": async () => {
    const { vaultService } = await getServices();
    return vaultService.requiresAuth();
  },

  "vault/resetPassword": async ({ oldPassword, newPassword }) => {
    const { vaultService, approvalLog } = await getServices();
    // Read under the old key; re-sealed under the new one below.
    const log = await approvalLog.entries().catch(() => []);
    const result = await vaultService.resetPassword(oldPassword, newPassword);
    if (result.ok) {
      await approvalLog.write(log);
      return { ok: true };
    }
    return {
      ok: false,
      error:
        result.error === ResetPasswordError.BadPassword
          ? "bad-password"
          : "keystore",
    };
  },

  "settings/getAutoLock": async () => {
    const { localStorage } = await getServices();
    return localStorage.getAutoLockMinutes();
  },

  "settings/setAutoLock": async ({ minutes }) => {
    const { localStorage } = await getServices();
    await localStorage.setAutoLockMinutes(minutes);
    applyAutoLock(minutes);
  },

  "keyring/generateMnemonic": async ({ size }) => {
    const { keyring } = await getServices();
    return keyring.generateMnemonic(size);
  },

  "keyring/validateMnemonic": async ({ phrase }) => {
    const { keyring } = await getServices();
    return keyring.validateMnemonic(phrase);
  },

  "keyring/saveAccountSecret": async (input) => {
    const { keyring } = await getServices();
    return keyring.storeAccountSecret(input);
  },

  "keyring/deriveShieldedAccount": async (input) => {
    const { keyring } = await getServices();
    return keyring.deriveShieldedAccount(input);
  },

  "keyring/saveDeviceAccount": async (input) => {
    const { keyring, approvals, broadcaster } = await getServices();
    const result = await keyring.storeDeviceAccount(input);
    void broadcaster.accountChanged(await approvals.followActiveAccount());
    return result;
  },

  "keyring/queryAccounts": async () => {
    const { accounts } = await getServices();
    return (await accounts.findAll()).map(toStoredAccount);
  },

  "keyring/getActiveAccount": async () => {
    const { accounts } = await getServices();
    return (await accounts.getActiveAccount()) ?? null;
  },

  "keyring/setActiveAccount": async ({ id, type }) => {
    const { accounts, approvals, broadcaster } = await getServices();
    await accounts.setActiveAccount(id, type);
    void broadcaster.accountChanged(await approvals.followActiveAccount());
  },

  "keyring/revealMnemonic": async ({ accountId }) => {
    const { keyring } = await getServices();
    return keyring.revealMnemonic(accountId);
  },

  "keyring/revealSpendingKey": async ({ accountId }) => {
    const { keyring } = await getServices();
    return keyring.revealSpendingKey(accountId);
  },

  "keyring/renameAccount": async ({ accountId, alias }) => {
    const { accounts } = await getServices();
    return toStoredAccount(await accounts.rename(accountId, alias));
  },

  "keyring/deleteAccount": async ({ accountId }) => {
    const { accounts, approvals, broadcaster } = await getServices();
    await accounts.remove(accountId);
    await approvals.followActiveAccount();
    // Any site may have lost its current wallet to the removal and moved on
    // to another it was given.
    void broadcaster.accountChanged();
  },

  // --- dapp (origin always from the sender context) ---

  "dapp/connect": async (_payload, ctx) => {
    const { approvals } = await getServices();
    await approvals.approveConnection(requireOrigin(ctx), ctx.tabId);
  },

  "dapp/disconnect": async (_payload, ctx) => {
    const { approvals } = await getServices();
    await approvals.approveDisconnection(requireOrigin(ctx), ctx.tabId);
  },

  "dapp/isConnected": async (_payload, ctx) => {
    const { approvals } = await getServices();
    return approvals.isConnectionApproved(requireOrigin(ctx));
  },

  "dapp/accounts": async (_payload, ctx) => {
    const { approvals } = await getServices();
    return approvals.dappAccounts(requireOrigin(ctx));
  },

  "dapp/defaultAccount": async (_payload, ctx) => {
    const { approvals } = await getServices();
    return approvals.dappDefaultAccount(requireOrigin(ctx));
  },

  "dapp/updateDefaultAccount": async (payload, ctx) => {
    // Crosses from an untrusted web page — validate before trusting the shape.
    const { address } = payload as { address?: unknown };
    if (typeof address !== "string") {
      throw new Error("zc.updateDefaultAccount: invalid arguments");
    }
    const { approvals } = await getServices();
    await approvals.approveUpdateDefaultAccount(
      requireOrigin(ctx),
      address,
      ctx.tabId
    );
  },

  "dapp/sign": async (payload, ctx) => {
    // The payload crosses from an untrusted web page — check its shape before
    // treating it as typed.
    const { pczt, signer } = payload as { pczt?: unknown; signer?: unknown };
    if (
      typeof pczt !== "string" ||
      (signer !== undefined && typeof signer !== "string")
    ) {
      throw new Error("zc.sign: invalid arguments");
    }
    if (pczt.length > MAX_PCZT_BASE64_LENGTH) {
      throw new Error("zc.sign: PCZT exceeds the 2 MiB limit");
    }
    const { approvals } = await getServices();
    return approvals.approveSignTx(pczt, requireOrigin(ctx), signer, ctx.tabId);
  },

  "dapp/sealLinkKey": async (payload, ctx) => {
    // Crosses from an untrusted web page — validate before trusting the shape.
    const { key } = payload as { key?: unknown };
    if (typeof key !== "string") {
      throw new Error("zc.sealLinkKey: invalid arguments");
    }
    const { approvals } = await getServices();
    return approvals.sealLinkKey(key, requireOrigin(ctx));
  },

  "dapp/openLinkKey": async (payload, ctx) => {
    // Crosses from an untrusted web page — validate before trusting the shape.
    const { sealed, nk } = payload as { sealed?: unknown; nk?: unknown };
    if (typeof sealed !== "string" || typeof nk !== "string") {
      throw new Error("zc.openLinkKey: invalid arguments");
    }
    const { approvals } = await getServices();
    return approvals.approveOpenLinkKey(requireOrigin(ctx), sealed, nk, ctx.tabId);
  },

  // --- approvals (trusted UIs) ---

  "approvals/isConnectionApproved": async ({ origin }) => {
    const { approvals } = await getServices();
    return approvals.isConnectionApproved(origin);
  },

  "approvals/resolveConnection": async ({ origin, allow, accountId }, ctx) => {
    const { approvals } = await getServices();
    await approvals.resolveConnection(
      requireTabId(ctx),
      origin,
      allow,
      accountId
    );
  },

  "approvals/resolveDisconnection": async ({ origin, revoke }, ctx) => {
    const { approvals, broadcaster } = await getServices();
    await approvals.resolveDisconnection(requireTabId(ctx), origin, revoke);
    if (revoke) void broadcaster.connectionRevoked(origin);
  },

  "approvals/connectedSites": async () => {
    const { approvals } = await getServices();
    return approvals.connectedSites();
  },

  "approvals/revokeConnection": async ({ origin }) => {
    const { approvals, broadcaster } = await getServices();
    await approvals.revokeConnection(origin);
    void broadcaster.connectionRevoked(origin);
  },

  "approvals/queryPcztSummary": async ({ msgId }) => {
    const { approvals } = await getServices();
    return approvals.queryPcztSummary(msgId);
  },

  "approvals/queryDeviceSignTx": async ({ msgId }) => {
    const { approvals } = await getServices();
    return approvals.queryDeviceSignTx(msgId);
  },

  "approvals/submitSignTx": async ({ msgId, signer, deviceData }, ctx) => {
    const { approvals } = await getServices();
    await approvals.submitSignTx(requireTabId(ctx), msgId, signer, deviceData);
  },

  "approvals/rejectSignTx": async ({ msgId }, ctx) => {
    const { approvals } = await getServices();
    await approvals.rejectSignTx(requireTabId(ctx), msgId);
  },

  "approvals/submitOpenLinkKey": async ({ msgId, password }, ctx) => {
    const { approvals } = await getServices();
    await approvals.submitOpenLinkKey(requireTabId(ctx), msgId, password);
  },

  "approvals/log": async () => {
    const { approvals } = await getServices();
    return approvals.approvalLog();
  },

  "approvals/clearLog": async () => {
    const { approvals } = await getServices();
    await approvals.clearApprovalLog();
  },

  "approvals/submitUpdateDefaultAccount": async ({ address }, ctx) => {
    const { approvals, broadcaster } = await getServices();
    await approvals.submitUpdateDefaultAccount(requireTabId(ctx), address);
    void broadcaster.accountChanged(await approvals.followActiveAccount());
  },
};
