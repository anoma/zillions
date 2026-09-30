/**
 * Prover worker: proves one signed PCZT and extracts its transaction. Halo2
 * proving (building its key included) runs for tens of seconds in wasm.
 */

import initZcore, { prove_pczt } from "@zillions/zcore";

// `self` typed as Window in a DOM-lib project; cast to the message surface we use.
const worker = self as unknown as {
  onmessage: ((e: MessageEvent<Uint8Array>) => void) | null;
  postMessage: (
    msg: { ok: { txid: string; raw: Uint8Array } } | { error: string },
  ) => void;
};

worker.onmessage = async ({ data }) => {
  try {
    await initZcore();
    worker.postMessage({ ok: prove_pczt(data) });
  } catch (e) {
    worker.postMessage({ error: e instanceof Error ? e.message : String(e) });
  }
};
