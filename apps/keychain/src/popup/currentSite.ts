import { useEffect, useState } from "react";
import browser from "webextension-polyfill";

import type { BackgroundClient } from "../ipc/client";

export type CurrentSite = { origin: string; connected: boolean };

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
      const connected = (await client.connectedSites()).includes(origin);
      if (live) setSite({ origin, connected });
    })().catch(console.error);
    return () => {
      live = false;
    };
  }, [client, refresh]);
  return site;
};
