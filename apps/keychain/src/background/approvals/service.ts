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
import { payments, transferAmount } from "../../approvals/utils/pczt";
import type {
  ApprovalKind,
  ApprovalLogEntry,
  ConnectedSite,
  DeviceSignTx,
} from "../../ipc/contract";
import { LocalStorage, type KeyStoreType } from "../../storage";
import { buildPcztSummary, linkAddress } from "../crypto/zillions";
import { Keyring } from "../keyring";
import { VaultService } from "../vault";
import { AccountRepository } from "../vault/accounts";
import type { ActiveAccountStore } from "../vault/types";
import type { ApprovalLog } from "./log";
import { toPublicAccount } from "./publicAccount";

/** What the log needs to know about a request beyond its outcome. */
type RequestMeta = {
  origin: string;
  kind: ApprovalKind;
  /** Read at decision time, once the popup has loaded what it shows. */
  describe?: () => Promise<Partial<ApprovalLogEntry>>;
};

type Resolver = {
  resolve: (result?: unknown) => void;
  reject: (error?: unknown) => void;
  meta: RequestMeta;
};

const MAX_OPEN_APPROVALS = 3;

/** `record` is the wallet `walletId` or one of its derived children. */
const isInWallet = (record: KeyStoreType, walletId: string): boolean =>
  record.id === walletId || record.parentId === walletId;

/** A dapp's PCZT awaiting user approval, parked under its `msgId`. */
type PendingSignTx = {
  pczt: string;
  signer?: string;
  /** Kept once the popup asked for it, so the log can name amount and payee. */
  summary?: PcztSummary;
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
    protected readonly keyring: Keyring,
    protected readonly log: ApprovalLog
  ) {}

  /** `tabs.onRemoved` handler, registered by the background entrypoint. */
  handleTabRemoved(tabId: number): void {
    const resolver = this.resolverMap[tabId];
    if (resolver) {
      void this.record(resolver.meta, "closed");
      resolver.reject(new Error("Window closed"));
      this.removeResolver(tabId);
    }
  }

  // ---- dapp-facing (origin always derived from the message sender) ----

  /**
   * Approved with a wallet that still exists, AND unlocked — what
   * `window.zc.isConnected()` reports.
   */
  async isConnectionApproved(origin: string): Promise<boolean> {
    if (await this.vaultService.isLocked()) {
      return false;
    }
    return (await this.siteWallet(origin)) !== undefined;
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
        { origin, kind: "connect" },
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
        { origin, kind: "disconnect" },
        approvalRoutes.approveDisconnection(),
        { interfaceOrigin: origin }
      );
    }
  }

  /**
   * Every account for a connected dapp (so it can offer a switcher), with key
   * material only on the site's current wallet and its children.
   */
  async dappAccounts(origin: string): Promise<ZCashKeychainAccount[]> {
    const wallet = await this.assertConnected(origin);
    return (await this.accounts.findAll()).map((record) =>
      toPublicAccount(record, isInWallet(record, wallet.id))
    );
  }

  /**
   * The site's current wallet; its shielded child instead when that is the
   * globally active account (a site may have switched to it by address).
   */
  async dappDefaultAccount(
    origin: string
  ): Promise<ZCashKeychainAccount | null> {
    const wallet = await this.assertConnected(origin);
    const activeId = (await this.accounts.getActiveAccount())?.id;
    const active = activeId && (await this.accounts.findById(activeId));
    return toPublicAccount(
      active && active.parentId === wallet.id ? active : wallet,
      true
    );
  }

  /**
   * Resolve a `sign()` call: park the PCZT under a msgId and open the
   * approval popup; resolves with the signed PCZT (base64) once the user
   * confirms. Requires an unlocked vault, a connected origin, and a signer
   * within the site's current wallet.
   */
  async approveSignTx(
    pczt: string,
    origin: string,
    signer?: string
  ): Promise<string> {
    if (await this.vaultService.isLocked()) {
      throw new Error("Keychain is locked");
    }
    const record = await this.activeSigner(origin, signer);

    const msgId = uuid();
    // The resolved address, so the summary and the signature use one account.
    const pending: PendingSignTx = { pczt, signer: record.address };
    this.pendingTxs.set(msgId, pending);

    const describe = async (): Promise<Partial<ApprovalLogEntry>> => {
      const account = await this.walletName(record);
      if (!pending.summary) return { account };
      return {
        account,
        amount: transferAmount(pending.summary).toString(),
        to: payments(pending.summary)[0]?.address,
      };
    };

    try {
      return await this.launchApprovalPopup<string>(
        { origin, kind: "sign", describe },
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
   * Seal a payment link's key to the site's current wallet. No popup: a seal
   * opens nothing, since unsealing a link needs that link's key already.
   */
  async sealLinkKey(key: string, origin: string): Promise<string> {
    const record = await this.activeSigner(origin);
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
    const record = await this.activeSigner(origin);
    const msgId = uuid();
    this.pendingLinks.set(msgId, { sealed, nk, signer: record.address });
    try {
      return await this.launchApprovalPopup<string>(
        { origin, kind: "open-link" },
        approvalRoutes.approveOpenLinkKey(),
        { msgId, origin, signer: record.address }
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
      void this.record(resolvers.meta, "approved");
    } catch (e) {
      void this.record(resolvers.meta, "failed");
      resolvers.reject(e);
    }
  }

  /**
   * Resolve an `updateDefaultAccount(address)` call: require a connected,
   * unlocked origin and an existing account, then open the approval popup,
   * which says when the switch shares a wallet the site hasn't seen. The popup
   * confirms via `submitUpdateDefaultAccount`.
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
    const connection = (await this.localStorage.getConnections())[origin];
    const shared = connection.accounts.includes(record.parentId ?? record.id);
    return this.launchApprovalPopup(
      {
        origin,
        kind: "default-account",
        describe: async () => ({ account: record.alias }),
      },
      approvalRoutes.approveUpdateDefaultAccount(),
      { address, alias: record.alias, origin, shared: String(shared) }
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
    pending.summary = summary;
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
      // The site may have been disconnected, or moved to another wallet, while
      // the popup was open; it may only sign with its wallet now.
      const record = await this.activeSigner(
        resolvers.meta.origin,
        signer || pending.signer
      );
      // A PCZT spans transparent + shielded; the keyring signs the whole PCZT
      // in one pass and returns the signed PCZT as base64.
      const signed = await this.keyring.sign(
        pending.pczt,
        record.address,
        deviceData
      );
      void this.record(resolvers.meta, "approved");
      resolvers.resolve(signed);
    } catch (e) {
      void this.record(resolvers.meta, "failed");
      resolvers.reject(e);
    }
  }

  /** The approval popup rejected: drop the PCZT and fail the dapp's promise. */
  async rejectSignTx(popupTabId: number, msgId: string): Promise<void> {
    const resolvers = this.getResolver(popupTabId);
    await this.record(resolvers.meta, "rejected");
    this.pendingTxs.delete(msgId);
    resolvers.reject(new Error("Sign Tx rejected"));
  }

  /**
   * The approval popup confirmed the default-account change: share the wallet
   * of `address` with the site, make it the site's current one and the active
   * account, and settle the dapp's promise.
   */
  async submitUpdateDefaultAccount(
    popupTabId: number,
    address: string
  ): Promise<void> {
    const resolvers = this.getResolver(popupTabId);
    const { origin } = resolvers.meta;
    try {
      await this.assertConnected(origin);
      const record = await this.accounts.findByAddress(address);
      if (!record) {
        throw new Error(`Account for ${address} not found!`);
      }
      const walletId = record.parentId ?? record.id;
      const { accounts } = (await this.localStorage.getConnections())[origin];
      await this.localStorage.setConnection(origin, {
        accounts: accounts.includes(walletId) ? accounts : [...accounts, walletId],
        current: walletId,
      });
      await this.accounts.setActiveAccount(
        record.id,
        record.type as ActiveAccountStore["type"]
      );
      void this.record(resolvers.meta, "approved");
      resolvers.resolve();
    } catch (e) {
      void this.record(resolvers.meta, "failed");
      resolvers.reject(e);
    }
  }

  /**
   * The approval popup's answer to a pending connection request; `accountId`
   * is the wallet the user connects the site with.
   */
  async resolveConnection(
    popupTabId: number,
    origin: string,
    allow: boolean,
    accountId?: string
  ): Promise<void> {
    const resolvers = this.getResolver(popupTabId);

    if (!allow) {
      await this.record(resolvers.meta, "rejected");
      resolvers.reject(new Error("Connection request rejected"));
      return;
    }

    try {
      // An approved origin only opened the window to log in: no new decision.
      if (!(await this.siteWallet(origin))) {
        const wallet = accountId && (await this.accounts.findById(accountId));
        if (!wallet || wallet.parentId) {
          throw new Error("Choose an account to connect");
        }
        await this.localStorage.setConnection(origin, {
          accounts: [wallet.id],
          current: wallet.id,
        });
        await this.record(resolvers.meta, "approved");
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
      await this.record(resolvers.meta, "rejected");
      resolvers.reject(new Error("Disconnection request rejected"));
      return;
    }

    try {
      await this.revokeConnection(origin);
      await this.record(resolvers.meta, "approved");
    } catch (e) {
      resolvers.reject(e);
      return;
    }
    resolvers.resolve();
  }

  approvalLog(): Promise<ApprovalLogEntry[]> {
    return this.log.entries();
  }

  clearApprovalLog(): Promise<void> {
    return this.log.clear();
  }

  /** Each connected origin and the wallet it currently sees. */
  async connectedSites(): Promise<ConnectedSite[]> {
    const sites: ConnectedSite[] = [];
    for (const origin of Object.keys(await this.localStorage.getConnections())) {
      const wallet = await this.siteWallet(origin);
      if (wallet) sites.push({ origin, accountId: wallet.id });
    }
    return sites;
  }

  async revokeConnection(origin: string): Promise<void> {
    await this.localStorage.removeConnection(origin);
  }

  /**
   * The active account changed: sites already sharing its wallet move to it.
   * Returns those origins, the only ones to tell; the others keep their
   * wallet and learn nothing of the switch.
   */
  async followActiveAccount(): Promise<string[]> {
    const activeId = (await this.accounts.getActiveAccount())?.id;
    const active = activeId && (await this.accounts.findById(activeId));
    if (!active) return [];
    const walletId = active.parentId ?? active.id;
    const followers: string[] = [];
    for (const [origin, connection] of Object.entries(
      await this.localStorage.getConnections()
    )) {
      if (!connection.accounts.includes(walletId)) continue;
      followers.push(origin);
      if (connection.current !== walletId) {
        await this.localStorage.setConnection(origin, {
          ...connection,
          current: walletId,
        });
      }
    }
    return followers;
  }

  // ---- internals ----

  private async record(
    meta: RequestMeta,
    outcome: ApprovalLogEntry["outcome"]
  ): Promise<void> {
    let details: Partial<ApprovalLogEntry> = {};
    try {
      details = (await meta.describe?.()) ?? {};
    } catch {
      // The entry still says who asked for what.
    }
    await this.log.record({
      ...details,
      origin: meta.origin,
      kind: meta.kind,
      outcome,
    });
  }

  /** A shielded account is named after the wallet (its parent) it belongs to. */
  private async walletName(record: KeyStoreType): Promise<string> {
    if (!record.parentId) return record.alias;
    return (await this.accounts.findById(record.parentId))?.alias ?? record.alias;
  }

  /**
   * The wallet `origin` currently sees: its `current` one, else (once that
   * was deleted) another it was given. Undefined when it has none left.
   */
  private async siteWallet(origin: string): Promise<KeyStoreType | undefined> {
    const connection = (await this.localStorage.getConnections())[origin];
    if (!connection) return undefined;
    for (const id of [connection.current, ...connection.accounts]) {
      const record = await this.accounts.findById(id);
      if (record && !record.parentId) return record;
    }
    return undefined;
  }

  /**
   * For a connected, unlocked `origin`: the `signer` address's account (else
   * the site's wallet), if within the site's current wallet.
   */
  private async activeSigner(
    origin: string,
    signer?: string
  ): Promise<KeyStoreType> {
    const wallet = await this.assertConnected(origin);
    const record = signer ? await this.accounts.findByAddress(signer) : wallet;
    // One error for unknown and other addresses: a site learns nothing new.
    if (!record || !isInWallet(record, wallet.id)) {
      throw new Error(`Signer ${signer} is not the active account`);
    }
    return record;
  }

  /** Throws unless unlocked and connected; returns the site's wallet. */
  private async assertConnected(origin: string): Promise<KeyStoreType> {
    if (await this.vaultService.isLocked()) {
      throw new Error("Keychain is locked");
    }
    const wallet = await this.siteWallet(origin);
    if (!wallet) {
      throw new Error(`Connection to ${origin} has not been approved`);
    }
    return wallet;
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
    meta: RequestMeta,
    route: string,
    params?: Record<string, string>
  ): Promise<T> => {
    const { origin } = meta;
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
        meta,
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
