// Chrome's compute host: the background service worker can't start workers,
// so this offscreen document runs them and answers its requests.
import { browser } from "wxt/browser";

import { runJob, stopProving } from "../../src/background/compute/pool";
import type {
  ComputeReply,
  ComputeRequest,
  ComputeStage,
  StopProving,
} from "../../src/background/compute/types";

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const request = msg as Partial<ComputeRequest & StopProving>;
  // Content scripts reach every extension page too; only our own may ask.
  if (sender.id !== browser.runtime.id || sender.tab) return undefined;
  if (request?.stopProving) {
    stopProving();
    sendResponse(null);
    return undefined;
  }
  if (!request?.compute) return undefined;
  const id = request.id!;
  const onStage = (computeStage: ComputeStage["computeStage"]) =>
    void browser.runtime.sendMessage({ computeStage, id } satisfies ComputeStage);
  runJob(request.compute, onStage).then(
    (ok) => sendResponse({ ok } satisfies ComputeReply),
    (e: unknown) =>
      sendResponse({
        error: e instanceof Error ? e.message : String(e),
      } satisfies ComputeReply)
  );
  return true;
});
