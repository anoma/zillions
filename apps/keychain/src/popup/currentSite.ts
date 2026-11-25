import { useEffect, useState } from "react";
import browser from "webextension-polyfill";

import type { BackgroundClient } from "../ipc/client";

/** `accountId`: the wallet the site sees, when connected; `shared`: every wallet it was given. */
export type CurrentSite = {
  origin: string;
  connected: boolean;
  accountId?: string;
  shared: string[];
};

/**
 * The web origin of the browser tab the popup was opened over, and whether it
 * is connected. Undefined for a non-web tab (new tab, settings pages).
 */
export const useCurrentSite = (
  client: BackgroundClient,
  /** Changes when the connected list changes, to re-check. */
  refresh?: unknown
): CurrentSite | undefined => {
  const [site, setSite] = useState<CurrentSite>();
  useEffect(() => {
    let live = true;
    void (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url || !/^https?:\/\//.test(tab.url)) return;
      const origin = new URL(tab.url).origin;
      const connected = (await client.connectedSites()).find(
        (s) => s.origin === origin
      );
      if (live) {
        setSite({
          origin,
          connected: !!connected,
          accountId: connected?.accountId,
          shared: connected?.shared ?? [],
        });
      }
    })().catch(console.error);
    return () => {
      live = false;
    };
  }, [client, refresh]);
  return site;
};
