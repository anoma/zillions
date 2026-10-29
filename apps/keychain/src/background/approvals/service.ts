/**
 * ApprovalsService: the background side of dapp requests (connection lifecycle,
 * PCZT signing, default-account changes). Chain ids are ignored — Zcash only.
 *
 * Flow: a `dapp/*` request launches an `approvals.html` popup window and
 * parks its promise in `resolverMap` keyed by the popup's tab id. The popup UI
 * answers via the trusted `approvals/resolve*` channels (its tab id comes from
 * the message sender), which settles the parked promise and so the dapp's
 * original request. Closing the popup rejects with "Window closed".
 *
 * Each origin may have one popup open at a time, and at most
 * `MAX_OPEN_APPROVALS` popups are open overall, so a page cannot flood the
 * user with windows.
 */
import { v4 as uuid } from "uuid";
import browser, { Windows } from "webextension-polyfill";

import type { PcztSummary, ZCashKeychainAccount } from "@zillions/types";
import { paramsToUrl } from "@zillions/utils";

import approvalRoutes from "../../approvals/routes";
import type { DeviceSignTx } from "../../ipc/contract";
import { LocalStorage, type KeyStoreType } from "../../storage";
import { buildPcztSummary, linkAddress } from "../crypto/zillions";
import { Keyring } from "../keyring";
import { VaultService } from "../vault";
import { AccountRepository } from "../vault/accounts";
import type { ActiveAccountStore } from "../vault/types";
import { toPublicAccount } from "./publicAccount";

type Resolver = {
  resolve: (result?: unknown) => void;
  reject: (error?: unknown) => void;
};

const MAX_OPEN_APPROVALS = 3;

/**
 * The active (parent) account and its derived children: the only accounts a
 * dapp may see key material for or sign with.
 */
const isInActiveScope = (record: KeyStoreType, activeId?: string): boolean =>
  activeId !== undefined &&
  (record.id === activeId || record.parentId === activeId);

/** A dapp's PCZT awaiting user approval, parked under its `msgId`. */
type PendingSignTx = {
  pczt: string;
  signer?: string;
};

const KEEPALIVE_INTERVAL_MS = 20_000;

export class ApprovalsService {
  /** Pending dapp requests, keyed by their approval popup's tab id. */
  protected resolverMap: Record<number, Resolver> = {};

  /**
   * PCZTs awaiting approval, keyed by msgId. In-memory: a pending request dies
   * with the worker anyway (its resolver lives in `resolverMap`).
   */
  protected readonly pendingTxs = new Map<string, PendingSignTx>();

  /**
   * Addresses of the payment links sealed here, so their funding is titled
   * as a link. In-memory: one lost with the worker shows as a plain send.
   */
  protected readonly sealedLinks = new Set<string>();

  /** "Show a payment link again" requests awaiting approval, keyed by msgId. */
  protected readonly pendingLinks = new Map<
    string,
    { sealed: string; nk: string; signer: string }
  >();

  /**
   * Origins with an approval popup open, mapped to its window id. Reserved
   * (window id undefined) before the window exists, so concurrent requests
   * from one origin cannot all pass the check.
   */
  protected readonly popupWindowByOrigin = new Map<
    string,
    number | undefined
  >();

  constructor(
    protected readonly localStorage: LocalStorage,
    protected readonly vaultService: VaultService,
    protected readonly accounts: AccountRepository,
    protected readonly keyring: Keyring
  ) {}

  /** `tabs.onRemoved` handler, registered by the background entrypoint. */
  handleTabRemoved(tabId: number): void {
    const resolver = this.resolverMap[tabId];
    if (resolver) {
      resolver.reject(new Error("Window closed"));
      this.removeResolver(tabId);
    }
  }

  // ---- dapp-facing (origin always derived from the message sender) ----

  /** Approved AND unlocked — what `window.zc.isConnected()` reports. */
  async isConnectionApproved(origin: string): Promise<boolean> {
    if (await this.vaultService.isLocked()) {
      return false;
    }
    return this.isDomainApproved(origin);
  }

  /**
   * Resolve a `connect()` call: already approved and unlocked is a no-op;
   * otherwise open the approval popup (which doubles as a login gate when the
   * vault is locked) and wait for the user's verdict.
   */
  async approveConnection(origin: string): Promise<void> {
    // Without a password the approval popup's Login gate can never succeed.
    if (!(await this.vaultService.passwordInitialized())) {
      throw new Error("Keychain is not set up");
    }
    const isLocked = await this.vaultService.isLocked();
    const needsApproval = !(await this.isConnectionApproved(origin));

    if (needsApproval || isLocked) {
      return this.launchApprovalPopup(
        origin,
        approvalRoutes.approveConnection(),
        { interfaceOrigin: origin }
      );
    }
  }

  /** Resolve a `disconnect()` call; a never-approved origin is a no-op. */
  async approveDisconnection(origin: string): Promise<void> {
    const isConnected = await this.isConnectionApproved(origin);

    if (isConnected) {
      return this.launchApprovalPopup(
        origin,
        approvalRoutes.approveDisconnection(),
        { interfaceOrigin: origin }
      );
    }
  }

  /**
   * Every account for a connected dapp (so it can offer a switcher), with key
   * material only on the active account and its children.
   */
  async dappAccounts(origin: string): Promise<ZCashKeychainAccount[]> {
    await this.assertConnected(origin);
    const activeId = (await this.accounts.getActiveAccount())?.id;
    return (await this.accounts.findAll()).map((record) =>
      toPublicAccount(record, isInActiveScope(record, activeId))
    );
  }

  /** The active account for a connected dapp, or null when none is set. */
  async dappDefaultAccount(
    origin: string
  ): Promise<ZCashKeychainAccount | null> {
    await this.assertConnected(origin);
    const active = await this.accounts.getActiveAccount();
    if (!active) return null;
    const record = await this.accounts.findById(active.id);
    return record ? toPublicAccount(record, true) : null;
  }

  /**
   * Resolve a `sign()` call: park the PCZT under a msgId and open the
   * approval popup; resolves with the signed PCZT (base64) once the user
   * confirms. Requires an unlocked vault, a connected origin, and a signer
   * within the active account.
   */
  async approveSignTx(
    pczt: string,
    origin: string,
    signer?: string
  ): Promise<string> {
    if (await this.vaultService.isLocked()) {
      throw new Error("Keychain is locked");
    }
    await this.assertConnected(origin);

    const record = await this.activeSigner(signer);

    const msgId = uuid();
    // The resolved address, so the summary and the signature use one account.
    this.pendingTxs.set(msgId, { pczt, signer: record.address });

    try {
      return await this.launchApprovalPopup<string>(
        origin,
        approvalRoutes.approveSignTx(
          msgId,
          encodeURIComponent(origin),
          record.type,
          record.address
        )
      );
    } finally {
      // Also covers a refused launch and a closed window, which never reach
      // submitSignTx/rejectSignTx.
      this.pendingTxs.delete(msgId);
    }
  }

  /**
   * Seal a payment link's key to the active account. No popup: a seal opens
   * nothing, since unsealing a link needs that link's key already.
   */
  async sealLinkKey(key: string, origin: string): Promise<string> {
    if (await this.vaultService.isLocked()) {
      throw new Error("Keychain is locked");
    }
    await this.assertConnected(origin);
    const record = await this.activeSigner();
    const sealed = await this.keyring.sealLinkKey(key, record.address);
    this.sealedLinks.add(linkAddress(key));
    return sealed;
  }

  /**
   * Resolve an `openLinkKey` call: the popup asks before the site gets the
   * link, which is as good as its money.
   */
  async approveOpenLinkKey(
    origin: string,
    sealed: string,
    nk: string
  ): Promise<string> {
    if (await this.vaultService.isLocked()) {
      throw new Error("Keychain is locked");
    }
    await this.assertConnected(origin);
    const record = await this.activeSigner();
    const msgId = uuid();
    this.pendingLinks.set(msgId, { sealed, nk, signer: record.address });
    try {
      return await this.launchApprovalPopup<string>(
        origin,
        approvalRoutes.approveOpenLinkKey(),
        { msgId, origin }
      );
    } finally {
      this.pendingLinks.delete(msgId);
    }
  }

  /** The popup approved: open the key and settle the dapp's promise. */
  async submitOpenLinkKey(popupTabId: number, msgId: string): Promise<void> {
    const pending = this.pendingLinks.get(msgId);
    const resolvers = this.getResolver(popupTabId);
    if (!pending) {
      throw new Error(`Pending link request not found for ${msgId}`);
    }
    this.pendingLinks.delete(msgId);
    try {
      resolvers.resolve(
        await this.keyring.openLinkKey(pending.sealed, pending.nk, pending.signer)
      );
    } catch (e) {
      resolvers.reject(e);
    }
  }

  /**
   * Resolve an `updateDefaultAccount(address)` call: require a connected,
   * unlocked origin and an existing account, then open the approval popup. The
   * popup confirms via `submitUpdateDefaultAccount`.
   */
  async approveUpdateDefaultAccount(
    origin: string,
    address: string
  ): Promise<void> {
    await this.assertConnected(origin);
    const record = await this.accounts.findByAddress(address);
    if (!record) {
      throw new Error(`Account for ${address} not found!`);
    }
    return this.launchApprovalPopup(
      origin,
      approvalRoutes.approveUpdateDefaultAccount(),
      { address, alias: record.alias }
    );
  }

  // ---- trusted-UI-facing (approval popup + Connected Sites) ----

  /** Display summary for a pending PCZT. */
  async queryPcztSummary(msgId: string): Promise<PcztSummary> {
    const pending = this.pendingTxs.get(msgId);
    if (!pending) {
      throw new Error(`Transaction data not found for ${msgId}`);
    }
    const ufvk = await this.keyring.viewingKey(pending.signer);
    const summary = await buildPcztSummary(pending.pczt, ufvk);
    const paid = [
      ...summary.transparentOutputs,
      ...summary.saplingOutputs,
      ...summary.orchardOutputs,
      ...summary.ironwoodOutputs,
    ].filter((o) => !o.mine);
    const link = paid.length === 1 && paid[0].address;
    return link && this.sealedLinks.has(link)
      ? { ...summary, paymentLink: true }
      : summary;
  }

  /**
   * The pending PCZT if a hardware wallet signs it: the device is reachable
   * only from the popup, which signs with it and submits the output. Null
   * when the keys aren't on a device.
   */
  async queryDeviceSignTx(msgId: string): Promise<DeviceSignTx | null> {
    const pending = this.pendingTxs.get(msgId);
    if (!pending) {
      throw new Error(`Transaction data not found for ${msgId}`);
    }
    const device = await this.keyring.signingDevice(pending.signer);
    return device
      ? { device: device.device, pczt: pending.pczt, hdIndex: device.hdIndex }
      : null;
  }

  /** The approval popup confirmed: sign and settle the dapp's promise. */
  async submitSignTx(
    popupTabId: number,
    msgId: string,
    signer: string,
    deviceData?: string
  ): Promise<void> {
    const pending = this.pendingTxs.get(msgId);
    const resolvers = this.getResolver(popupTabId);

    if (!pending) {
      throw new Error(`Pending signing data not found for ${msgId}`);
    }
    // Claim the request before awaiting, so a concurrent submit for the same
    // msgId fails the check above instead of signing a second time.
    this.pendingTxs.delete(msgId);

    try {
      // The active account may have changed while the popup was open, and a
      // site may only sign with the one active now.
      const record = await this.activeSigner(signer || pending.signer);
      // A PCZT spans transparent + shielded; the keyring signs the whole PCZT
      // in one pass and returns the signed PCZT as base64.
      const signed = await this.keyring.sign(
        pending.pczt,
        record.address,
        deviceData
      );
      resolvers.resolve(signed);
    } catch (e) {
      resolvers.reject(e);
    }
  }

  /** The approval popup rejected: drop the PCZT and fail the dapp's promise. */
  async rejectSignTx(popupTabId: number, msgId: string): Promise<void> {
    const resolvers = this.getResolver(popupTabId);
    this.pendingTxs.delete(msgId);
    resolvers.reject(new Error("Sign Tx rejected"));
  }

  /**
   * The approval popup confirmed the default-account change: point the active
   * account at `address` and settle the dapp's promise.
   */
  async submitUpdateDefaultAccount(
    popupTabId: number,
    address: string
  ): Promise<void> {
    const resolvers = this.getResolver(popupTabId);
    try {
      const record = await this.accounts.findByAddress(address);
      if (!record) {
        throw new Error(`Account for ${address} not found!`);
      }
      await this.accounts.setActiveAccount(
        record.id,
        record.type as ActiveAccountStore["type"]
      );
      resolvers.resolve();
    } catch (e) {
      resolvers.reject(e);
    }
  }

  /** The approval popup's answer to a pending connection request. */
  async resolveConnection(
    popupTabId: number,
    origin: string,
    allow: boolean
  ): Promise<void> {
    const resolvers = this.getResolver(popupTabId);

    if (!allow) {
      resolvers.reject(new Error("Connection request rejected"));
      return;
    }

    try {
      if (!(await this.localStorage.getApprovedOrigins())?.includes(origin)) {
        await this.localStorage.addApprovedOrigin(origin);
      }
    } catch (e) {
      resolvers.reject(e);
      return;
    }
    resolvers.resolve();
  }

  /** The approval popup's answer to a pending disconnection request. */
  async resolveDisconnection(
    popupTabId: number,
    origin: string,
    revoke: boolean
  ): Promise<void> {
    const resolvers = this.getResolver(popupTabId);

    if (!revoke) {
      resolvers.reject(new Error("Disconnection request rejected"));
      return;
    }

    try {
      await this.revokeConnection(origin);
    } catch (e) {
      resolvers.reject(e);
      return;
    }
    resolvers.resolve();
  }

  async approvedOrigins(): Promise<string[]> {
    return (await this.localStorage.getApprovedOrigins()) ?? [];
  }

  async revokeConnection(origin: string): Promise<void> {
    await this.localStorage.removeApprovedOrigin(origin);
  }

  // ---- internals ----

  private async isDomainApproved(origin: string): Promise<boolean> {
    const approvedOrigins = (await this.localStorage.getApprovedOrigins()) || [];
    return approvedOrigins.includes(origin);
  }

  /** The `signer` address's account (else the active one), if within the active account. */
  private async activeSigner(signer?: string): Promise<KeyStoreType> {
    const activeId = (await this.accounts.getActiveAccount())?.id;
    const record = signer
      ? await this.accounts.findByAddress(signer)
      : activeId
        ? await this.accounts.findById(activeId)
        : undefined;
    if (!signer && !record) {
      throw new Error("No active account to sign with");
    }
    // One error for unknown and inactive addresses: a site learns nothing new.
    if (!record || !isInActiveScope(record, activeId)) {
      throw new Error(`Signer ${signer} is not the active account`);
    }
    return record;
  }

  private async assertConnected(origin: string): Promise<void> {
    if (await this.vaultService.isLocked()) {
      throw new Error("Keychain is locked");
    }
    if (!(await this.isDomainApproved(origin))) {
      throw new Error(`Connection to ${origin} has not been approved`);
    }
  }

  private createPopup = (url: string): Promise<Windows.Window> => {
    return browser.windows.create({
      url,
      width: 396,
      height: 640,
      type: "popup",
    });
  };

  private getPopupTabId = (window: Windows.Window): number => {
    const popupTabId = window.tabs?.[0]?.id;

    if (!popupTabId) {
      throw new Error("no popup tab ID");
    }

    if (popupTabId in this.resolverMap) {
      throw new Error(`tab ID ${popupTabId} already exists in promise map`);
    }

    return popupTabId;
  };

  private launchApprovalPopup = async <T>(
    origin: string,
    route: string,
    params?: Record<string, string>
  ): Promise<T> => {
    if (this.popupWindowByOrigin.has(origin)) {
      const windowId = this.popupWindowByOrigin.get(origin);
      if (windowId !== undefined) {
        void browser.windows
          .update(windowId, { focused: true })
          .catch(() => undefined);
      }
      throw new Error("A request from this site is already pending");
    }
    if (this.popupWindowByOrigin.size >= MAX_OPEN_APPROVALS) {
      throw new Error(
        "Too many pending Keychain approvals; resolve one and try again"
      );
    }
    // No await between the checks above and this reservation.
    this.popupWindowByOrigin.set(origin, undefined);

    const baseUrl = `${browser.runtime.getURL("/approvals.html")}#${route}`;
    const url = params ? paramsToUrl(baseUrl, params) : baseUrl;

    let popupTabId: number;
    try {
      const window = await this.createPopup(url);
      popupTabId = this.getPopupTabId(window);
      this.popupWindowByOrigin.set(origin, window.id);
    } catch (e) {
      this.popupWindowByOrigin.delete(origin);
      throw e;
    }

    // Chrome stops an idle MV3 worker after 30 s, taking the parked resolver
    // with it; any extension API call resets that timer.
    const keepAlive = setInterval(
      () => void browser.runtime.getPlatformInfo(),
      KEEPALIVE_INTERVAL_MS
    );

    return new Promise<T>((resolve, reject) => {
      this.resolverMap[popupTabId] = {
        resolve: (args) => {
          this.removeResolver(popupTabId);
          this.popupWindowByOrigin.delete(origin);
          return resolve(args as T);
        },
        reject: (args) => {
          this.removeResolver(popupTabId);
          this.popupWindowByOrigin.delete(origin);
          return reject(args);
        },
      };
    }).finally(() => clearInterval(keepAlive));
  };

  private getResolver = (popupTabId: number): Resolver => {
    const resolvers = this.resolverMap[popupTabId];
    if (!resolvers) {
      throw new Error(`no resolvers found for tab ID ${popupTabId}`);
    }
    return resolvers;
  };

  private removeResolver = (popupTabId: number): void => {
    delete this.resolverMap[popupTabId];
  };
}
