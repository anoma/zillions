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
 * Each origin may have one request pending at a time, and at most
 * `MAX_PENDING_APPROVALS` are pending overall, so a page cannot flood the
 * user with windows. Only one popup is open at a time; the rest queue, so a
 * site's window can never open over another's and catch a click meant for it.
 * A request belongs to the tab that made it and dies with it, or when it
 * leaves the site, so one tab cannot hold several sites' slots. A site whose
 * window the user closes or rejects is refused new ones for a while, so it
 * cannot reopen it the moment it goes.
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
import { ZILLIONS_APP_URL } from "../../popup/links";
import { LocalStorage, type KeyStoreType } from "../../storage";
import { buildPcztSummary, linkAddress, transparentGapLimits } from "../crypto/zillions";
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
  /** The tab that asked; the request is cancelled when it closes or leaves `origin`. */
  tabId?: number;
  /** Read at decision time, once the popup has loaded what it shows. */
  describe?: () => Promise<Partial<ApprovalLogEntry>>;
};

type Resolver = {
  resolve: (result?: unknown) => void;
  reject: (error?: unknown) => void;
  meta: RequestMeta;
  /** The popup's URL as the browser reports it; see handleTabUpdated. */
  url?: string;
};

/** Firefox reports a new window's tab as blank before its page loads. */
const reportedUrl = (url?: string): string | undefined =>
  url && url !== "about:blank" ? url : undefined;

const MAX_PENDING_APPROVALS = 3;

/**
 * How long a site waits after its Nth dismissed window in a row (closed or
 * rejected): a mistaken Reject or two costs an honest site seconds, while a
 * site that reopens its window on every dismissal soon waits minutes.
 */
const DISMISSAL_COOLDOWNS_MS = [3_000, 10_000, 30_000, 60_000, 2 * 60_000, 5 * 60_000];

/** Dismissals further apart than this start the count again; above the cap. */
const DISMISSAL_MEMORY_MS = 10 * 60_000;

/**
 * The only sites that may seal and reopen payment links: links are the
 * Zillions app's (product §2.10), and a link's key is as good as its money,
 * so a lookalike site the user connected must not be able to ask for one.
 * Other deployments of the app are added at build time.
 */
const LINK_ORIGINS: ReadonlySet<string> = new Set([
  new URL(ZILLIONS_APP_URL).origin,
  ...(process.env.Z_INTERFACE_LINK_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => new URL(o).origin),
]);

const assertLinkOrigin = (origin: string): void => {
  if (!LINK_ORIGINS.has(origin)) {
    throw new Error("Payment links work only in the Zillions app");
  }
};

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
   * Origins with a request pending, mapped to its popup's window id. Reserved
   * (window id undefined) while queued and before the window exists, so
   * concurrent requests from one origin cannot all pass the check.
   */
  protected readonly popupWindowByOrigin = new Map<
    string,
    number | undefined
  >();

  private popupOpen = false;
  /** Requests waiting for the popup slot, with the tab each came from. */
  private readonly popupQueue: Array<{
    tabId?: number;
    resolve: () => void;
    reject: (e: Error) => void;
  }> = [];

  /** Per origin: dismissals in a row, when the last was, and until when it waits. */
  private readonly dismissals = new Map<
    string,
    { count: number; at: number; until: number }
  >();

  /** In-memory clock, replaceable in tests. */
  protected now = (): number => Date.now();

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
    this.cancelRequestsFrom(tabId, () => true);
  }

  /**
   * `tabs.onUpdated` handler, registered by the background entrypoint. The
   * approvals page never changes its own URL (it routes in memory), so a
   * change means another extension navigated the window: fail the request
   * and close the window instead of letting the new page answer it.
   */
  handleTabUpdated(tabId: number, url?: string): void {
    // A requesting tab that left its site: in-page navigation keeps the request.
    if (url) {
      let origin: string | undefined;
      try {
        origin = new URL(url).origin;
      } catch {
        // Not a URL with an origin: it left the site.
      }
      this.cancelRequestsFrom(tabId, (meta) => meta.origin !== origin);
    }
    const resolver = this.resolverMap[tabId];
    const reported = reportedUrl(url);
    if (!resolver || !reported) return;
    if (!resolver.url) {
      resolver.url = reported;
      return;
    }
    if (reported === resolver.url) return;
    void this.record(resolver.meta, "failed");
    resolver.reject(new Error("Approval window was navigated away"));
    void browser.tabs.remove(tabId).catch(() => undefined);
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
  async approveConnection(origin: string, tabId?: number): Promise<void> {
    // Without a password the approval popup's Login gate can never succeed.
    if (!(await this.vaultService.passwordInitialized())) {
      throw new Error("Keychain is not set up");
    }
    const isLocked = await this.vaultService.isLocked();
    const needsApproval = !(await this.isConnectionApproved(origin));

    if (needsApproval || isLocked) {
      return this.launchApprovalPopup(
        { origin, kind: "connect", tabId },
        approvalRoutes.approveConnection(),
        { interfaceOrigin: origin }
      );
    }
  }

  /** Resolve a `disconnect()` call; a never-approved origin is a no-op. */
  async approveDisconnection(origin: string, tabId?: number): Promise<void> {
    const isConnected = await this.isConnectionApproved(origin);

    if (isConnected) {
      return this.launchApprovalPopup(
        { origin, kind: "disconnect", tabId },
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
    signer?: string,
    tabId?: number
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
        { origin, kind: "sign", describe, tabId },
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
    assertLinkOrigin(origin);
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
    nk: string,
    tabId?: number
  ): Promise<string> {
    assertLinkOrigin(origin);
    const record = await this.activeSigner(origin);
    const msgId = uuid();
    this.pendingLinks.set(msgId, { sealed, nk, signer: record.address });
    try {
      return await this.launchApprovalPopup<string>(
        { origin, kind: "open-link", tabId },
        approvalRoutes.approveOpenLinkKey(),
        { msgId, origin, signer: record.address }
      );
    } finally {
      this.pendingLinks.delete(msgId);
    }
  }

  /** The popup approved: open the key and settle the dapp's promise. */
  async submitOpenLinkKey(
    popupTabId: number,
    msgId: string,
    password: string
  ): Promise<void> {
    const pending = this.pendingLinks.get(msgId);
    const resolvers = this.getResolver(popupTabId);
    if (!pending) {
      throw new Error(`Pending link request not found for ${msgId}`);
    }
    // Asked every time, as a seed account's signature is: the key is the
    // link's money. A wrong password leaves the request open to retry.
    if (!(await this.vaultService.checkPassword(password))) {
      throw new Error("Incorrect password");
    }
    if (!this.pendingLinks.delete(msgId)) {
      throw new Error(`Pending link request not found for ${msgId}`);
    }
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
    address: string,
    tabId?: number
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
        tabId,
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
    const built = await buildPcztSummary(pending.pczt, ufvk);
    const summary = {
      ...built,
      unusualChange: await this.unusualChange(pending.signer, built),
    };
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
      ? {
          device: device.device,
          pczt: pending.pczt,
          hdIndex: device.hdIndex,
          credentialId: device.credentialId,
        }
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
      // The approval UI asks for the password when this holds; enforced here
      // too, so no UI path can sign without it.
      if (await this.vaultService.requiresAuth()) {
        throw new Error("Password required to sign");
      }
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
      void this.rememberChange(pending).catch(console.error);
      resolvers.resolve(signed);
    } catch (e) {
      void this.record(resolvers.meta, "failed");
      resolvers.reject(e);
    }
  }

  /** The approval popup rejected: drop the PCZT and fail the dapp's promise. */
  async rejectSignTx(popupTabId: number, msgId: string): Promise<void> {
    const resolvers = this.getResolver(popupTabId);
    this.pendingTxs.delete(msgId);
    resolvers.reject(new Error("Sign Tx rejected"));
    void this.record(resolvers.meta, "rejected");
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
      resolvers.reject(new Error("Connection request rejected"));
      void this.record(resolvers.meta, "rejected");
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
        // The log write runs two Argon2 derivations; the window must not
        // linger that long under the user's next click.
        void this.record(resolvers.meta, "approved");
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
      void this.record(resolvers.meta, "rejected");
      return;
    }

    try {
      await this.revokeConnection(origin);
    } catch (e) {
      resolvers.reject(e);
      return;
    }
    resolvers.resolve();
    void this.record(resolvers.meta, "approved");
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
    // Before any await: the site's retry may already be on its way.
    this.noteOutcome(meta.origin, outcome);
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

  /** The wallet (parent account) id behind a signer address. */
  private async walletIdOf(signer?: string): Promise<string | undefined> {
    const record = signer ? await this.accounts.findByAddress(signer) : undefined;
    return record ? (record.parentId ?? record.id) : undefined;
  }

  /**
   * The first transparent output of ours past the last address this Keychain
   * approved plus the gap wallets scan: a wallet restoring the phrase walks
   * the addresses in order and stops at that gap, so it may never reach it.
   */
  private async unusualChange(
    signer: string | undefined,
    summary: PcztSummary
  ): Promise<PcztSummary["unusualChange"]> {
    const walletId = await this.walletIdOf(signer);
    if (!walletId) return undefined;
    const approved = await this.localStorage.changeIndexes(walletId);
    const gaps = transparentGapLimits();
    for (const output of summary.transparentOutputs) {
      const { path } = output;
      if (!output.mine || !path) continue;
      const highest = approved[path.scope] ?? -1;
      if (path.index > highest + (gaps[path.scope] ?? 0)) {
        return { ...path, value: String(output.value ?? "0") };
      }
    }
    return undefined;
  }

  /** A signed transaction's own transparent outputs move the approved mark. */
  private async rememberChange(pending: PendingSignTx): Promise<void> {
    const walletId = await this.walletIdOf(pending.signer);
    if (!walletId || !pending.summary) return;
    for (const output of pending.summary.transparentOutputs) {
      if (output.mine && output.path) {
        await this.localStorage.raiseChangeIndex(
          walletId,
          output.path.scope,
          output.path.index
        );
      }
    }
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
    // Raising the pending window here would let a page put it under the
    // user's cursor or keystrokes on demand.
    if (this.popupWindowByOrigin.has(origin)) {
      throw new Error("A request from this site is already pending");
    }
    const waiting = this.dismissals.get(origin);
    if (waiting && this.now() < waiting.until) {
      throw new Error(
        "The user dismissed this site's last Keychain request; try again later"
      );
    }
    if (this.popupWindowByOrigin.size >= MAX_PENDING_APPROVALS) {
      throw new Error(
        "Too many pending Keychain approvals; resolve one and try again"
      );
    }
    // No await between the checks above and this reservation.
    this.popupWindowByOrigin.set(origin, undefined);
    this.showPendingCount();

    const baseUrl = `${browser.runtime.getURL("/approvals.html")}#${route}`;
    const url = params ? paramsToUrl(baseUrl, params) : baseUrl;

    // Chrome stops an idle MV3 worker after 30 s, taking the parked resolver
    // with it; any extension API call resets that timer.
    const keepAlive = setInterval(
      () => void browser.runtime.getPlatformInfo(),
      KEEPALIVE_INTERVAL_MS
    );

    let popupTabId: number;
    let popupUrl: string | undefined;
    try {
      await this.acquirePopup(meta.tabId);
      let window: Windows.Window | undefined;
      try {
        window = await this.createPopup(url);
        popupTabId = this.getPopupTabId(window);
        const tab = window.tabs?.[0];
        popupUrl = reportedUrl(tab?.url) ?? reportedUrl(tab?.pendingUrl);
        this.popupWindowByOrigin.set(origin, window.id);
      } catch (e) {
        if (window?.id !== undefined) {
          void browser.windows.remove(window.id).catch(() => undefined);
        }
        this.releasePopup();
        throw e;
      }
    } catch (e) {
      this.popupWindowByOrigin.delete(origin);
      this.showPendingCount();
      clearInterval(keepAlive);
      throw e;
    }

    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const settle = () => {
        // A second release would free the slot under the next open popup.
        if (settled) return;
        settled = true;
        this.removeResolver(popupTabId);
        this.popupWindowByOrigin.delete(origin);
        this.showPendingCount();
        this.releasePopup();
      };
      this.resolverMap[popupTabId] = {
        meta,
        url: popupUrl,
        resolve: (args) => {
          settle();
          return resolve(args as T);
        },
        reject: (args) => {
          settle();
          return reject(args);
        },
      };
    }).finally(() => clearInterval(keepAlive));
  };

  /**
   * Waits until no other approval popup is open, then claims the slot.
   * Rejects if the requesting tab goes first (see cancelRequestsFrom).
   */
  private acquirePopup = async (tabId?: number): Promise<void> => {
    if (!this.popupOpen) {
      this.popupOpen = true;
      return;
    }
    await new Promise<void>((resolve, reject) =>
      this.popupQueue.push({ tabId, resolve, reject })
    );
  };

  /**
   * Fails the requests `tabId` made that `gone` says it no longer stands
   * behind: queued ones leave the queue, an open one's window closes.
   */
  private cancelRequestsFrom(
    tabId: number,
    gone: (meta: RequestMeta) => boolean
  ): void {
    for (const [popupTabId, resolver] of Object.entries(this.resolverMap)) {
      if (resolver.meta.tabId !== tabId || !gone(resolver.meta)) continue;
      void this.record(resolver.meta, "failed");
      resolver.reject(new Error("The page that asked is gone"));
      void browser.tabs.remove(Number(popupTabId)).catch(() => undefined);
    }
    for (let i = this.popupQueue.length - 1; i >= 0; i--) {
      const queued = this.popupQueue[i];
      if (queued.tabId !== tabId) continue;
      this.popupQueue.splice(i, 1);
      queued.reject(new Error("The page that asked is gone"));
    }
  }

  /**
   * A dismissed window (closed or rejected) makes its site wait, longer each
   * time in a row; an approval clears the count.
   */
  private noteOutcome(origin: string, outcome: ApprovalLogEntry["outcome"]): void {
    if (outcome === "approved") {
      this.dismissals.delete(origin);
      return;
    }
    if (outcome !== "closed" && outcome !== "rejected") return;
    const now = this.now();
    const last = this.dismissals.get(origin);
    const count =
      last && now - last.at < DISMISSAL_MEMORY_MS ? last.count + 1 : 1;
    const wait =
      DISMISSAL_COOLDOWNS_MS[Math.min(count, DISMISSAL_COOLDOWNS_MS.length) - 1];
    this.dismissals.set(origin, { count, at: now, until: now + wait });
  }

  /**
   * Pending requests on the toolbar badge. The open popup is never raised
   * again, so if it gets buried this is how the user learns that it, and the
   * requests queued behind it, are waiting.
   */
  private showPendingCount = (): void => {
    const count = this.popupWindowByOrigin.size;
    void browser.action
      .setBadgeText({ text: count ? String(count) : "" })
      .catch(() => undefined);
  };

  /** Hands the slot to the next queued request, or frees it. */
  private releasePopup = (): void => {
    const next = this.popupQueue.shift();
    if (next) next.resolve();
    else this.popupOpen = false;
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
