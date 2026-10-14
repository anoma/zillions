/**
 * Prover worker: proves one signed PCZT and extracts its transaction. Halo2
 * proving (building its key included) runs for tens of seconds in wasm.
 */

import initZcore, { prove_pczt } from "@zillions/zcore";
import type { ProveStage, Proved, SaplingParams } from "./submit";

// `self` typed as Window in a DOM-lib project; cast to the message surface we use.
const worker = self as unknown as {
  onmessage:
    | ((e: MessageEvent<{ pczt: Uint8Array; sapling?: SaplingParams }>) => void)
    | null;
  postMessage: (
    msg: { ok: Proved } | { error: string } | { stage: ProveStage },
  ) => void;
};

worker.onmessage = async ({ data: { pczt, sapling } }) => {
  try {
    await initZcore();
    worker.postMessage({
      ok: prove_pczt(
        pczt,
        sapling?.spend,
        sapling?.output,
        (stage: ProveStage) => worker.postMessage({ stage }),
      ),
    });
  } catch (e) {
    worker.postMessage({ error: e instanceof Error ? e.message : String(e) });
  }
};
