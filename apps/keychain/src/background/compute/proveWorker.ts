/**
 * Prover worker, kept alive across transactions so the Halo2 keys are built
 * once: `warm` builds them, `prove` proves one signed PCZT and extracts its
 * transaction. Messages run in order, so a proof sent mid-warm-up waits.
 */
import initZcore, {
  needs_sapling_params,
  prove_pczt,
  warm_prover,
} from "@zillions/zcore";
import type { ProveStage } from "@zillions/types";

import type { ProveTask, ProveWorkerMessage } from "./types";

const worker = self as unknown as {
  onmessage: ((e: MessageEvent<ProveTask>) => void) | null;
  postMessage: (msg: ProveWorkerMessage, transfer?: Transferable[]) => void;
};

const packaged = async (path: string): Promise<Uint8Array> => {
  const res = await fetch(new URL(path, self.location.origin));
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};

/** The Sapling parameters ship with the extension; read once, when first needed. */
let sapling: Promise<[Uint8Array, Uint8Array]> | undefined;
const saplingParams = () =>
  (sapling ??= Promise.all([
    packaged("/params/sapling-spend.params"),
    packaged("/params/sapling-output.params"),
  ]).catch((e) => {
    sapling = undefined;
    throw e;
  }));

let ready: Promise<unknown> | undefined;

export const startProveWorker = (): void => {
  worker.onmessage = async ({ data }) => {
    try {
      await (ready ??= initZcore({
        module_or_path: new URL("/wasm/zcore_bg.wasm", self.location.origin),
      }));
      if (data.op === "warm") {
        warm_prover();
        worker.postMessage({ ok: null });
        return;
      }
      const stage = (s: ProveStage) => worker.postMessage({ stage: s });
      let params: [Uint8Array, Uint8Array] | undefined;
      if (needs_sapling_params(data.pczt)) {
        stage("sapling-params");
        params = await saplingParams();
      }
      const proved = prove_pczt(data.pczt, params?.[0], params?.[1], stage);
      // zcore serialises `raw` as a plain number array, which can't be transferred.
      const raw = Uint8Array.from(proved.raw as ArrayLike<number>);
      worker.postMessage({ ok: { ...proved, raw } }, [raw.buffer]);
    } catch (err) {
      worker.postMessage({ error: err instanceof Error ? err.message : String(err) });
    }
  };
};
