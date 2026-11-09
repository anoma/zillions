import browser from "webextension-polyfill";

import { startAutoLock } from "../src/background/autoLock";
import { startBackgroundServer } from "../src/background/server";
import { getServices } from "../src/background/services";

/**
 * Background entrypoint. Starts the typed IPC server (vault-backed).
 *
 * The toolbar action now opens the popup (`entrypoints/popup`), so there is no
 * `action.onClicked` handler here — the popup decides whether to show the
 * wallet UI or redirect to the Setup tab (when no wallet exists yet).
 *
 * `defineBackground`'s main must be synchronous, and event listeners are
 * registered in it directly so the event that woke the worker is delivered;
 * async work (service warm-up) is kicked off without awaiting.
 */
export default defineBackground(() => {
  // Kick off vault/keyring init (wasm + IndexedDB) so the first IPC call
  // doesn't pay the cold-start cost. Handlers still await getServices().
  void getServices().catch(() => {
    // Init failed; individual IPC handlers will surface the error to the UI.
  });

  startBackgroundServer();
  startAutoLock();

  browser.tabs.onRemoved.addListener((tabId) => {
    void getServices()
      .then(({ approvals }) => approvals.handleTabRemoved(tabId))
      .catch(() => {
        // Init failed, so no approval can be pending for this tab.
      });
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url === undefined) return;
    void getServices()
      .then(({ approvals }) => approvals.handleTabUpdated(tabId, changeInfo.url))
      .catch(() => {
        // Init failed, so no approval can be pending for this tab.
      });
  });
});
