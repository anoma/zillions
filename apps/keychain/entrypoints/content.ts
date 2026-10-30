import browser from "webextension-polyfill";

import { createBackgroundClient } from "../src/ipc/client";
import { isDappEventMessage } from "../src/background/broadcaster";
import { matchPatterns } from "../src/origins";
import { startProxy } from "../src/provider/proxy";

// `defineContentScript` / `injectScript` are auto-imported by WXT (`#imports`).
export default defineContentScript({
  // The Zillions app only; development builds add the local dev servers.
  matches: matchPatterns(import.meta.env.MODE === "development"),
  runAt: "document_start",
  allFrames: false,
  world: "ISOLATED",
  async main() {
    // Relay page provider calls to the background over the typed dapp channels.
    startProxy(createBackgroundClient());

    // Re-emit background broadcasts (account changed / lock / unlock /
    // connection revoked) as DOM CustomEvents on the page's window, which the
    // dapp listens for via the `@zillions/types` `Events` names. A DOM event
    // dispatched here (ISOLATED world) is seen by MAIN-world page listeners.
    browser.runtime.onMessage.addListener((message: unknown) => {
      if (isDappEventMessage(message)) {
        window.dispatchEvent(new CustomEvent(message.event));
      }
    });

    // Inject the MAIN-world script (`injected.js`, an unlisted entrypoint
    // listed in web_accessible_resources) so it sets `window.zc`.
    await injectScript("/injected.js", { keepInDom: true });
  },
});
