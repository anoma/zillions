/**
 * Broadcasts wallet state changes to connected dapp tabs. The background sends
 * a `DappEventMessage` to each relevant tab's content script, which re-emits it
 * as a DOM `CustomEvent` (`@zillions/types` `Events`) the page listens for.
 *
 * Account / lock / unlock events go to every connected (approved) origin;
 * a connection-revoked event targets the specific (now-unapproved) origin.
 */
import { Events } from "@zillions/types";
import browser from "webextension-polyfill";

import type { LocalStorage } from "../storage";

/** Background → content-script envelope carrying one dapp event. */
export type DappEventMessage = { type: "zillions/event"; event: Events };

export const isDappEventMessage = (m: unknown): m is DappEventMessage =>
  typeof m === "object" &&
  m !== null &&
  (m as { type?: unknown }).type === "zillions/event" &&
  typeof (m as { event?: unknown }).event === "string";

export class Broadcaster {
  constructor(private readonly localStorage: LocalStorage) {}

  /** The active account changed. */
  accountChanged(): Promise<void> {
    return this.broadcastToConnected(Events.AccountChanged);
  }

  /** The vault was locked. */
  locked(): Promise<void> {
    return this.broadcastToConnected(Events.ExtensionLocked);
  }

  /** The vault was unlocked. */
  unlocked(): Promise<void> {
    return this.broadcastToConnected(Events.ExtensionUnlocked);
  }

  /**
   * A connection was revoked. Targets `origin` explicitly since it has already
   * been removed from the approved set by the time this fires.
   */
  connectionRevoked(origin: string): Promise<void> {
    return this.sendToOrigins(Events.ConnectionRevoked, new Set([origin]));
  }

  private async broadcastToConnected(event: Events): Promise<void> {
    const approved = new Set(
      (await this.localStorage.getApprovedOrigins()) ?? []
    );
    if (approved.size > 0) {
      await this.sendToOrigins(event, approved);
    }
  }

  private async sendToOrigins(
    event: Events,
    origins: Set<string>
  ): Promise<void> {
    const tabs = await browser.tabs.query({});
    const message: DappEventMessage = { type: "zillions/event", event };
    await Promise.all(
      tabs.map(async (tab) => {
        if (tab.id === undefined || !tab.url) return;
        let tabOrigin: string;
        try {
          tabOrigin = new URL(tab.url).origin;
        } catch {
          return; // non-URL tab (e.g. chrome://) — skip.
        }
        if (!origins.has(tabOrigin)) return;
        try {
          await browser.tabs.sendMessage(tab.id, message);
        } catch {
          // No content script in that tab to receive it — ignore.
        }
      })
    );
  }
}
