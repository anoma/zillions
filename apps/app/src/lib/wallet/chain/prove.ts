/**
 * Prover worker, kept alive across sends so the Halo2 keys are built once:
 * `warm` builds them, a proof request proves one signed PCZT. Messages run in
 * order, so a proof sent mid-warm-up waits for the keys.
 */

import initZcore, { prove_pczt, warm_prover } from "@zillions/zcore";
import type { ProveStage, Proved, SaplingParams } from "./submit";

export type ProveRequest =
  { warm: true } | { pczt: Uint8Array; sapling?: SaplingParams };

export type ProveResponse =
  | { warmed: number }
  | { warmFailed: string }
  | { ok: Proved }
  | { error: string }
  | { stage: ProveStage };

// `self` typed as Window in a DOM-lib project; cast to the message surface we use.
const worker = self as unknown as {
  onmessage: ((e: MessageEvent<ProveRequest>) => void) | null;
  postMessage: (msg: ProveResponse) => void;
};

worker.onmessage = async ({ data }) => {
  try {
    await initZcore();
    if ("warm" in data) {
      const start = performance.now();
      warm_prover();
      worker.postMessage({ warmed: performance.now() - start });
      return;
    }
    const { pczt, sapling } = data;
    worker.postMessage({
      ok: prove_pczt(
        pczt,
        sapling?.spend,
        sapling?.output,
        (stage: ProveStage) => worker.postMessage({ stage }),
      ),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    worker.postMessage(
      "warm" in data ? { warmFailed: message } : { error: message },
    );
  }
};
