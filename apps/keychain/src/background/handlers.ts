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
import { applyAutoLock, stopComputeOnLock } from "./autoLock";
import { stopCompute } from "./compute/host";
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

/**
 * Above any chunk body: a `/memos` one, the largest, is ~8.7 MB, 11.6 MB as
 * base64. Bounds what a page can queue.
 */
const MAX_CHUNK_BASE64_LENGTH = 16 * 1024 * 1024;

/** Tree tips are ~1 MB each, and a send needs a few chunks besides. */
const MAX_TX_PROPS_LENGTH = 48 * 1024 * 1024;

const POOLS: readonly unknown[] = ["sapling", "orchard", "ironwood"];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const isIndex = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

const isChunkBody = (v: unknown): v is string =>
  typeof v === "string" && v.length <= MAX_CHUNK_BASE64_LENGTH;

const isOptionalString = (v: unknown): v is string | undefined =>
  v === undefined || typeof v === "string";

/** Shapes the background reads itself; zcore checks the rest as it parses. */
const isTxPayload = (v: Record<string, unknown>): boolean =>
  isRecord(v.trees) &&
  Object.entries(v.trees).every(
    ([pool, t]) =>
      POOLS.includes(pool) &&
      isRecord(t) &&
      typeof t.tip === "string" &&
      Array.isArray(t.chunks) &&
      t.chunks.every(
        (c) => Array.isArray(c) && isIndex(c[0]) && typeof c[1] === "string"
      ) &&
      isOptionalString(t.bucket)
  ) &&
  JSON.stringify(v).length <= MAX_TX_PROPS_LENGTH;

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
    void stopComputeOnLock();
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

  "settings/getSyncWhileLocked": async () => {
    const { localStorage } = await getServices();
    return localStorage.getSyncWhileLocked();
  },

  "settings/setSyncWhileLocked": async ({ on }) => {
    if (typeof on !== "boolean") {
      throw new Error("settings/setSyncWhileLocked: invalid arguments");
    }
    const { localStorage, vaultService } = await getServices();
    await localStorage.setSyncWhileLocked(on);
    if (!on && (await vaultService.isLocked())) await stopCompute();
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

  "keyring/setActiveAccount": async ({ id, type, shareWith }) => {
    const { accounts, approvals, broadcaster } = await getServices();
    if (shareWith) await approvals.shareWallet(shareWith, id);
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
    const { accounts, approvals, broadcaster, localStorage } = await getServices();
    await accounts.remove(accountId);
    // Marks are kept per wallet; a child's id has none.
    await localStorage.clearChangeIndexes(accountId);
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

  "dapp/isLocked": async (_payload, ctx) => {
    const { approvals } = await getServices();
    return approvals.isLockedFor(requireOrigin(ctx));
  },

  "dapp/account": async (_payload, ctx) => {
    const { approvals } = await getServices();
    return approvals.dappAccount(requireOrigin(ctx));
  },

  "dapp/switchAccount": async (_payload, ctx) => {
    const { approvals } = await getServices();
    await approvals.approveSwitchAccount(requireOrigin(ctx), ctx.tabId);
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

  "dapp/decryptCompact": async (payload, ctx) => {
    // Crosses from an untrusted web page — validate before trusting the shape.
    const p = payload as Partial<Record<string, unknown>>;
    const tried = p.tried as Partial<Record<string, unknown>> | undefined;
    if (
      !isOptionalString(p.account) ||
      !POOLS.includes(p.pool) ||
      !isIndex(p.chunk) ||
      !isChunkBody(p.ciphertexts) ||
      (tried !== undefined &&
        (!isRecord(tried) ||
          !isIndex(tried.count) ||
          typeof tried.digest !== "string" ||
          !/^[0-9a-f]*$/.test(tried.digest)))
    ) {
      throw new Error("zc.decryptCompact: invalid arguments");
    }
    const { approvals } = await getServices();
    return approvals.decryptCompact(requireOrigin(ctx), payload);
  },

  "dapp/decryptFull": async (payload, ctx) => {
    // Crosses from an untrusted web page — validate before trusting the shape.
    const p = payload as Partial<Record<string, unknown>>;
    if (
      !isOptionalString(p.account) ||
      !POOLS.includes(p.pool) ||
      !isIndex(p.chunk) ||
      !isChunkBody(p.ciphertexts) ||
      !isChunkBody(p.memos) ||
      !isChunkBody(p.outgoing) ||
      !Array.isArray(p.hits) ||
      !p.hits.every(isIndex) ||
      (p.sends !== undefined &&
        (!Array.isArray(p.sends) || !p.sends.every(isIndex)))
    ) {
      throw new Error("zc.decryptFull: invalid arguments");
    }
    const { approvals } = await getServices();
    return approvals.decryptFull(requireOrigin(ctx), payload);
  },

  "dapp/accountInfo": async (payload, ctx) => {
    const { account } = payload as { account?: unknown };
    if (!isOptionalString(account)) {
      throw new Error("zc.accountInfo: invalid arguments");
    }
    const { approvals } = await getServices();
    return approvals.accountInfo(requireOrigin(ctx), account);
  },

  "dapp/freshAddress": async (payload, ctx) => {
    const { account } = payload as { account?: unknown };
    if (!isOptionalString(account)) {
      throw new Error("zc.freshAddress: invalid arguments");
    }
    const { approvals } = await getServices();
    return approvals.freshAddress(requireOrigin(ctx), account);
  },

  "dapp/transparentAddresses": async (payload, ctx) => {
    // Crosses from an untrusted web page — validate before trusting the shape.
    const p = payload as Partial<Record<string, unknown>>;
    if (
      !isOptionalString(p.account) ||
      (p.scope !== "external" && p.scope !== "internal") ||
      !isIndex(p.from) ||
      !isIndex(p.count) ||
      p.count > 1000
    ) {
      throw new Error("zc.transparentAddresses: invalid arguments");
    }
    const { approvals } = await getServices();
    return approvals.transparentAddresses(requireOrigin(ctx), payload);
  },

  "dapp/sendTransaction": async (payload, ctx) => {
    // Crosses from an untrusted web page — validate before trusting the shape.
    const p = payload as Partial<Record<string, unknown>>;
    if (
      typeof p.signer !== "string" ||
      !isOptionalString(p.account) ||
      typeof p.proposal !== "string" ||
      !isRecord(p.wallet) ||
      (p.changeIndex !== undefined && !isIndex(p.changeIndex)) ||
      !isTxPayload(p)
    ) {
      throw new Error("zc.sendTransaction: invalid arguments");
    }
    const { approvals, broadcaster } = await getServices();
    return approvals.approveSend(
      requireOrigin(ctx),
      payload,
      (stage) => broadcaster.proveStage(ctx.tabId, stage),
      ctx.tabId
    );
  },

  "dapp/claimLink": async (payload, ctx) => {
    // Crosses from an untrusted web page — validate before trusting the shape.
    const p = payload as Partial<Record<string, unknown>>;
    if (
      !isOptionalString(p.account) ||
      typeof p.key !== "string" ||
      typeof p.note !== "string" ||
      !isIndex(p.position) ||
      !isIndex(p.tip) ||
      !isTxPayload(p)
    ) {
      throw new Error("zc.claimLink: invalid arguments");
    }
    const { approvals, broadcaster } = await getServices();
    return approvals.claimLink(requireOrigin(ctx), payload, (stage) =>
      broadcaster.proveStage(ctx.tabId, stage)
    );
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

  "approvals/submitSwitchAccount": async ({ accountId }, ctx) => {
    const { approvals, broadcaster } = await getServices();
    await approvals.submitSwitchAccount(requireTabId(ctx), accountId);
    void broadcaster.accountChanged(await approvals.followActiveAccount());
  },
};
