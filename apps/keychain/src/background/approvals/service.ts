/**
 * ApprovalsService: the background side of dapp requests (connection lifecycle,
 * PCZT signing, default-account changes). Chain ids are ignored — Zcash only.
 *
 * Flow: a `dapp/*` request launches an `approvals.html` popup window and
 * parks its promise in `resolverMap` keyed by the popup's tab id. The popup UI
 * answers via the trusted `approvals/resolve*` channels (its tab id comes from
 * the message sender), which settles the parked promise and so the dapp's
 * original request. Closing the popup rejects with "Window closed".
 */
import { v4 as uuid } from "uuid";
import browser, { Windows } from "webextension-polyfill";

import type { PcztSummary, ZCashKeychainAccount } from "@zillions/types";
import { paramsToUrl } from "@zillions/utils";

import approvalRoutes from "../../approvals/routes";
import { LocalStorage } from "../../storage";
import { Keyring } from "../keyring";
import { VaultService } from "../vault";
import { AccountRepository } from "../vault/accounts";
import type { ActiveAccountStore } from "../vault/types";
import { toPublicAccount } from "./publicAccount";

type Resolver = {
  resolve: (result?: unknown) => void;
  reject: (error?: unknown) => void;
};

/** A dapp's PCZT awaiting user approval, parked under its `msgId`. */
type PendingSignTx = {
  pczt: string;
  signer?: string;
};

export class ApprovalsService {
  /** Pending dapp requests, keyed by their approval popup's tab id. */
  protected resolverMap: Record<number, Resolver> = {};

  /**
   * PCZTs awaiting approval, keyed by msgId. In-memory: a pending request dies
   * with the worker anyway (its resolver lives in `resolverMap`).
   */
  protected readonly pendingTxs = new Map<string, PendingSignTx>();

  constructor(
    protected readonly localStorage: LocalStorage,
    protected readonly vaultService: VaultService,
    protected readonly accounts: AccountRepository,
    protected readonly keyring: Keyring
  ) {
    browser.tabs.onRemoved.addListener((tabId) => {
      const resolver = this.resolverMap[tabId];
      if (resolver) {
        resolver.reject(new Error("Window closed"));
        this.removeResolver(tabId);
      }
    });
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
    const isLocked = await this.vaultService.isLocked();
    const needsApproval = !(await this.isConnectionApproved(origin));

    if (needsApproval || isLocked) {
      return this.launchApprovalPopup(approvalRoutes.approveConnection(), {
        interfaceOrigin: origin,
      });
    }
  }

  /** Resolve a `disconnect()` call; a never-approved origin is a no-op. */
  async approveDisconnection(origin: string): Promise<void> {
    const isConnected = await this.isConnectionApproved(origin);

    if (isConnected) {
      return this.launchApprovalPopup(approvalRoutes.approveDisconnection(), {
        interfaceOrigin: origin,
      });
    }
  }

  /** Public account records for a connected dapp. */
  async dappAccounts(origin: string): Promise<ZCashKeychainAccount[]> {
    await this.assertConnected(origin);
    return (await this.accounts.findAll()).map(toPublicAccount);
  }

  /** The active account for a connected dapp, or null when none is set. */
  async dappDefaultAccount(
    origin: string
  ): Promise<ZCashKeychainAccount | null> {
    await this.assertConnected(origin);
    const active = await this.accounts.getActiveAccount();
    if (!active) return null;
    const record = await this.accounts.findById(active.id);
    return record ? toPublicAccount(record) : null;
  }

  /**
   * Resolve a `sign()` call: park the PCZT under a msgId and open the
   * approval popup; resolves with the signed PCZT (base64) once the user
   * confirms. Requires an unlocked vault and a connected origin.
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

    // Resolve the signer/account type shown by the approval popup.
    let signerAddress = signer;
    let accountType: string;
    if (signerAddress) {
      const record = await this.accounts.findByAddress(signerAddress);
      if (!record) {
        throw new Error(`Account for ${signerAddress} not found!`);
      }
      accountType = record.type;
    } else {
      const active = await this.accounts.getActiveAccount();
      const record = active
        ? await this.accounts.findById(active.id)
        : undefined;
      if (!record) {
        throw new Error("No active account to sign with");
      }
      signerAddress = record.address;
      accountType = record.type;
    }

    const msgId = uuid();
    this.pendingTxs.set(msgId, { pczt, signer });

    return this.launchApprovalPopup(
      approvalRoutes.approveSignTx(
        msgId,
        encodeURIComponent(origin),
        accountType,
        signerAddress
      )
    );
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
      approvalRoutes.approveUpdateDefaultAccount(),
      { address, alias: record.alias }
    );
  }

  // ---- trusted-UI-facing (approval popup + Connected Sites) ----

  /** Display summary for a pending PCZT: returns with zcore's transaction building. */
  async queryPcztSummary(_msgId: string): Promise<PcztSummary> {
    throw new Error("Transaction summaries are not available yet");
  }

  /** The approval popup confirmed: sign and settle the dapp's promise. */
  async submitSignTx(
    popupTabId: number,
    msgId: string,
    signer: string
  ): Promise<void> {
    const pending = this.pendingTxs.get(msgId);
    const resolvers = this.getResolver(popupTabId);

    if (!pending) {
      throw new Error(`Pending signing data not found for ${msgId}`);
    }

    try {
      // A PCZT spans transparent + shielded; the keyring signs the whole PCZT
      // in one pass and returns the signed PCZT as base64.
      const signed = await this.keyring.sign(
        pending.pczt,
        signer || pending.signer
      );
      resolvers.resolve(signed);
    } catch (e) {
      resolvers.reject(e);
    }

    this.pendingTxs.delete(msgId);
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
    route: string,
    params?: Record<string, string>
  ): Promise<T> => {
    const baseUrl = `${browser.runtime.getURL("/approvals.html")}#${route}`;
    const url = params ? paramsToUrl(baseUrl, params) : baseUrl;

    const window = await this.createPopup(url);
    const popupTabId = this.getPopupTabId(window);

    return new Promise<T>((resolve, reject) => {
      this.resolverMap[popupTabId] = {
        resolve: (args) => {
          this.removeResolver(popupTabId);
          return resolve(args as T);
        },
        reject: (args) => {
          this.removeResolver(popupTabId);
          return reject(args);
        },
      };
    });
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
