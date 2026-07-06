import { startInjected } from "../src/provider/injected";

// Unlisted script: emitted as `injected.js` at the output root and injected
// into the page's MAIN world via `injectScript('/injected.js')` from the
// content script. Listed in web_accessible_resources in wxt.config.ts.
export default defineUnlistedScript(() => {
  startInjected();
});
