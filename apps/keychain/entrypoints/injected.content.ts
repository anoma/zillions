import { startInjected } from "../src/provider/injected";

// The page provider (`window.zc`), declared in the manifest to run in the
// page's MAIN world. Not a `<script src>` injected by `content.ts`: on Firefox
// that URL, kept in the DOM and in every provider error's `stack`, carries the
// extension's per-install UUID, which pages could use as a cross-site ID.
// Firefox hides MAIN-world content script filenames.
export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  allFrames: false,
  world: "MAIN",
  main() {
    startInjected();
  },
});
