/**
 * Prover worker, kept alive across transactions so the Halo2 keys are built
 * once: `warm` builds them, `prove` proves one signed PCZT and extracts its
 * transaction. Messages run in order, so a proof sent mid-warm-up waits.
 *
 * Where the page is cross-origin isolated (Chrome's offscreen document), it
 * proves with zcore's threaded build on a pool of workers, each another
 * instance of this script; elsewhere (Firefox), on this thread alone.
 */
import initSingle, * as single from "@zillions/zcore";
import initThreaded, * as threaded from "@zillions/zcore/pkg/mt/zcore.js";
import type { ProveStage } from "@zillions/types";

import type { ProveTask, ProveWorkerMessage } from "./types";

/** Prover worker → a pool thread it starts. */
type ThreadStart = { module: WebAssembly.Module; memory: WebAssembly.Memory };

const worker = self as unknown as {
  crossOriginIsolated?: boolean;
  location: Location;
  onmessage: ((e: MessageEvent<ProveTask | ThreadStart>) => void) | null;
  postMessage: (msg: ProveWorkerMessage | null, transfer?: Transferable[]) => void;
};

const wasmUrl = (path: string) => new URL(path, worker.location.origin);

const packaged = async (path: string): Promise<Uint8Array> => {
  const res = await fetch(wasmUrl(path));
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

type Prover = Pick<typeof single, "needs_sapling_params" | "prove_pczt" | "warm_prover">;

/** Resolves with the threaded build once each of its pool's workers runs. */
async function startThreads(): Promise<Prover> {
  const module = await WebAssembly.compileStreaming(fetch(wasmUrl("/wasm/zcore_mt_bg.wasm")));
  const { memory } = await initThreaded({ module_or_path: module });
  // The page's other work (and the app's tab) keeps a core.
  const count = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
  // Building the pool blocks this thread, and a blocked worker can't start any.
  await Promise.all(
    Array.from({ length: count }, () => {
      const pool = new Worker(worker.location.href);
      pool.postMessage({ module, memory } satisfies ThreadStart);
      return new Promise((resolve, reject) => {
        pool.onmessage = resolve;
        pool.onerror = (e) => reject(new Error(e.message || "prover thread error"));
      });
    }),
  );
  threaded.start_threads(count);
  console.info(`[prove] ${count} threads`);
  return threaded;
}

async function startSingle(): Promise<Prover> {
  await initSingle({ module_or_path: wasmUrl("/wasm/zcore_bg.wasm") });
  return single;
}

let prover: Promise<Prover> | undefined;
const getProver = () =>
  (prover ??= worker.crossOriginIsolated
    ? startThreads().catch((e: unknown) => {
        console.warn("[prove] threads failed, proving on one:", e);
        return startSingle();
      })
    : (console.info("[prove] one thread: not cross-origin isolated"), startSingle()));

/** A pool thread: joins the prover's memory, then works until terminated. */
async function runThread({ module, memory }: ThreadStart) {
  await initThreaded({ module_or_path: module, memory });
  worker.postMessage(null);
  threaded.run_thread();
}

export const startProveWorker = (): void => {
  worker.onmessage = async ({ data }) => {
    if ("module" in data) return runThread(data);
    try {
      const z = await getProver();
      if (data.op === "warm") {
        z.warm_prover();
        worker.postMessage({ ok: null });
        return;
      }
      const stage = (s: ProveStage) => worker.postMessage({ stage: s });
      let params: [Uint8Array, Uint8Array] | undefined;
      if (z.needs_sapling_params(data.pczt)) {
        stage("sapling-params");
        params = await saplingParams();
      }
      const proved = z.prove_pczt(data.pczt, params?.[0], params?.[1], stage);
      // zcore serialises `raw` as a plain number array, which can't be transferred.
      const raw = Uint8Array.from(proved.raw as ArrayLike<number>);
      worker.postMessage({ ok: { ...proved, raw } }, [raw.buffer]);
    } catch (err) {
      worker.postMessage({ error: err instanceof Error ? err.message : String(err) });
    }
  };
};
