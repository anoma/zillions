/**
 * The last leg of every transaction: a signed PCZT proven off the UI thread
 * and broadcast through lightwalletd. Sapling proofs need the Sapling
 * parameters (~51 MB), fetched only when the PCZT has Sapling in it.
 */

import outputUrl from "@zillions/sapling-params/sapling-output.params?url";
import spendUrl from "@zillions/sapling-params/sapling-spend.params?url";
import initZcore, { needs_sapling_params } from "@zillions/zcore";
import { sendTransaction } from "./lightwalletd";
import type { ProveRequest, ProveResponse } from "./prove";
import ProveWorker from "./prove.ts?worker";

/** The files' published hashes; bad parameters would make bad proofs. */
const SAPLING_PARAMS = {
  spend: {
    url: spendUrl,
    sha256: "8e48ffd23abb3a5fd9c5589204f32d9c31285a04b78096ba40a79b75677efc13",
  },
  output: {
    url: outputUrl,
    sha256: "2f0ebbcbb9bb0bcffe95a397e7eba89c29eb4dde6191c339db88570e3f3fb0e4",
  },
};

export type SaplingParams = { spend: Uint8Array; output: Uint8Array };

async function fetchVerified({ url, sha256 }: { url: string; sha256: string }) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sapling parameters: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hex = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex !== sha256) throw new Error("Sapling parameters failed their check");
  return bytes;
}

// ponytail: the browser's HTTP cache keeps the files between sends (their
// URLs are content-hashed); move to IndexedDB if it evicts them in practice.
let saplingParams: Promise<SaplingParams> | undefined;
const loadSaplingParams = () =>
  (saplingParams ??= Promise.all([
    fetchVerified(SAPLING_PARAMS.spend),
    fetchVerified(SAPLING_PARAMS.output),
  ])
    .then(([spend, output]) => ({ spend, output }))
    .catch((err) => {
      saplingParams = undefined;
      throw err;
    }));

/** `prove_pczt`'s result. */
export interface Proved {
  txid: string;
  raw: Uint8Array;
  /** The last height it can be mined at; 0 for never. */
  expiry_height: number;
}

/** The slow steps of a submission, in order; any the transaction doesn't need are skipped. */
export type ProveStage =
  | "sapling-params"
  | "sapling-proofs"
  | "proving-key"
  | "orchard-proof"
  | "ironwood-proof"
  | "verifying"
  | "broadcast";

// ponytail: one prover for the page and one proof at a time, as one form
// submits at a time; queue requests if that stops holding.
let prover: Worker | undefined;
/** When the running warm-up started; unset once it ends. */
let warmingSince: number | undefined;

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/** Logs the end of a warm-up, if `data` is one. */
function warmUpEnded(
  data: ProveResponse,
): data is { warmed: number } | { warmFailed: string } {
  if ("warmed" in data) {
    console.log(`[prover] keys ready in ${secs(data.warmed)}`);
  } else if ("warmFailed" in data) {
    console.warn(`[prover] warm-up failed: ${data.warmFailed}`);
  } else {
    return false;
  }
  warmingSince = undefined;
  return true;
}

/** The page's prove worker, started on first use. */
function proveWorker() {
  if (!prover) {
    prover = new ProveWorker();
    prover.onmessage = ({ data }: MessageEvent<ProveResponse>) => {
      if (warmUpEnded(data) && "warmFailed" in data) resetProver();
    };
    prover.onerror = (e) => {
      console.warn(`[prover] worker failed: ${e.message}`);
      resetProver();
    };
  }
  return prover;
}

/** Drops the worker so the next use starts fresh: a failed wasm instance isn't reused. */
function resetProver() {
  prover?.terminate();
  prover = undefined;
  warmingSince = undefined;
}

/**
 * Builds the proving keys in the prove worker now, for the next proof to skip
 * (~16 s of a ~28 s proof in Chromium). Call it when a send form opens.
 */
export function warmProver() {
  if (prover) return;
  console.log("[prover] building keys…");
  proveWorker().postMessage({ warm: true } satisfies ProveRequest);
  warmingSince = performance.now();
}

/** Proves a signed PCZT in the prove worker: it takes tens of seconds. */
function prove(
  pczt: Uint8Array,
  sapling: SaplingParams | undefined,
  onStage: (stage: ProveStage) => void,
) {
  // A fresh worker (none yet, or one dropped after a failure) builds the keys first.
  warmProver();
  const worker = proveWorker();
  if (warmingSince !== undefined) {
    // The worker runs messages in order: this proof starts once the keys are built.
    onStage("proving-key");
    console.log(
      `[prover] waiting for the keys, ${secs(performance.now() - warmingSince)} in`,
    );
  }
  return new Promise<Proved>((resolve, reject) => {
    const fail = (message: string) => {
      resetProver();
      reject(new Error(message));
    };
    worker.onmessage = ({ data }: MessageEvent<ProveResponse>) => {
      if (warmUpEnded(data)) {
        if ("warmFailed" in data) fail(data.warmFailed);
      } else if ("stage" in data) onStage(data.stage);
      else if ("error" in data) fail(data.error);
      else resolve(data.ok);
    };
    worker.onerror = (e) => fail(e.message || "prover failed");
    worker.postMessage({ pczt, sapling } satisfies ProveRequest);
  });
}

/**
 * Proves and broadcasts a signed PCZT; returns it raw, with its id and expiry
 * height. `onStage` is called as each slow step starts.
 */
export async function submitTransaction(
  signed: Uint8Array,
  onStage: (stage: ProveStage) => void = () => {},
) {
  await initZcore();
  let sapling: SaplingParams | undefined;
  if (needs_sapling_params(signed)) {
    onStage("sapling-params");
    sapling = await loadSaplingParams();
  }
  const { txid, raw, expiry_height } = await prove(signed, sapling, onStage);
  onStage("broadcast");
  await sendTransaction(raw);
  return { txid, raw, expiryHeight: expiry_height };
}
