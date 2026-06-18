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
import { getServices } from "./services";
import { ResetPasswordError } from "./vault";

/** Project a stored vault record onto the popup-facing `StoredAccount`. */
const toStoredAccount = (a: KeyStoreType): StoredAccount => ({
  id: a.id,
  alias: a.alias,
  address: a.address,
  owner: a.owner,
  publicKey: a.publicKey,
  type: a.type as AccountType,
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
    const { vaultService } = await getServices();
    await vaultService.createPassword(password);
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
    const { vaultService } = await getServices();
    const result = await vaultService.resetPassword(oldPassword, newPassword);
    if (result.ok) return { ok: true };
    return {
      ok: false,
      error:
        result.error === ResetPasswordError.BadPassword
          ? "bad-password"
          : "keystore",
    };
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

  "keyring/queryAccounts": async () => {
    const { accounts } = await getServices();
    return (await accounts.findAll()).map(toStoredAccount);
  },

  "keyring/getActiveAccount": async () => {
    const { accounts } = await getServices();
    return (await accounts.getActiveAccount()) ?? null;
  },

  "keyring/setActiveAccount": async ({ id, type }) => {
    const { accounts, broadcaster } = await getServices();
    await accounts.setActiveAccount(id, type);
    void broadcaster.accountChanged();
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
    const { accounts, broadcaster } = await getServices();
    await accounts.remove(accountId);
    // Removing the active account repoints it, so dapps may see a new default.
    void broadcaster.accountChanged();
  },

  // --- dapp (origin always from the sender context) ---

  "dapp/connect": async (_payload, ctx) => {
    const { approvals } = await getServices();
    await approvals.approveConnection(requireOrigin(ctx));
  },

  "dapp/disconnect": async (_payload, ctx) => {
    const { approvals } = await getServices();
    await approvals.approveDisconnection(requireOrigin(ctx));
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
    await approvals.approveUpdateDefaultAccount(requireOrigin(ctx), address);
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
    const { approvals } = await getServices();
    return approvals.approveSignTx(pczt, requireOrigin(ctx), signer);
  },

  "dapp/signArbitrary": async (payload, ctx) => {
    const { signer, data } = payload as { signer?: unknown; data?: unknown };
    if (typeof signer !== "string" || typeof data !== "string") {
      throw new Error("zc.signArbitrary: invalid arguments");
    }
    const { approvals } = await getServices();
    return approvals.approveSignArbitrary(requireOrigin(ctx), signer, data);
  },

  "dapp/verify": async (payload, ctx) => {
    const { publicKey, hash, signature } = payload as {
      publicKey?: unknown;
      hash?: unknown;
      signature?: unknown;
    };
    if (
      typeof publicKey !== "string" ||
      typeof hash !== "string" ||
      typeof signature !== "string"
    ) {
      throw new Error("zc.verify: invalid arguments");
    }
    // Pure public-key crypto, but still a dapp channel — derive (and require)
    // the sender origin so only content scripts reach it.
    requireOrigin(ctx);
    const { keyring } = await getServices();
    return keyring.verifyArbitrary(publicKey, hash, signature);
  },

  // --- approvals (trusted UIs) ---

  "approvals/isConnectionApproved": async ({ origin }) => {
    const { approvals } = await getServices();
    return approvals.isConnectionApproved(origin);
  },

  "approvals/resolveConnection": async ({ origin, allow }, ctx) => {
    const { approvals } = await getServices();
    await approvals.resolveConnection(requireTabId(ctx), origin, allow);
  },

  "approvals/resolveDisconnection": async ({ origin, revoke }, ctx) => {
    const { approvals, broadcaster } = await getServices();
    await approvals.resolveDisconnection(requireTabId(ctx), origin, revoke);
    if (revoke) void broadcaster.connectionRevoked(origin);
  },

  "approvals/connectedSites": async () => {
    const { approvals } = await getServices();
    return approvals.approvedOrigins();
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

  "approvals/submitSignTx": async ({ msgId, signer }, ctx) => {
    const { approvals } = await getServices();
    await approvals.submitSignTx(requireTabId(ctx), msgId, signer);
  },

  "approvals/rejectSignTx": async ({ msgId }, ctx) => {
    const { approvals } = await getServices();
    await approvals.rejectSignTx(requireTabId(ctx), msgId);
  },

  "approvals/submitUpdateDefaultAccount": async ({ address }, ctx) => {
    const { approvals, broadcaster } = await getServices();
    await approvals.submitUpdateDefaultAccount(requireTabId(ctx), address);
    void broadcaster.accountChanged();
  },

  "approvals/querySignArbitrary": async ({ msgId }) => {
    const { approvals } = await getServices();
    return approvals.querySignArbitrary(msgId);
  },

  "approvals/submitSignArbitrary": async ({ msgId }, ctx) => {
    const { approvals } = await getServices();
    await approvals.submitSignArbitrary(requireTabId(ctx), msgId);
  },

  "approvals/rejectSignArbitrary": async ({ msgId }, ctx) => {
    const { approvals } = await getServices();
    await approvals.rejectSignArbitrary(requireTabId(ctx), msgId);
  },
};
