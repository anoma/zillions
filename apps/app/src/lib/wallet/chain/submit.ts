/**
 * The last leg of every transaction: a signed PCZT proven off the UI thread
 * and broadcast through lightwalletd. Sapling proofs need the Sapling
 * parameters (~51 MB), fetched only when the PCZT has Sapling in it.
 */

import outputUrl from "@zillions/sapling-params/sapling-output.params?url";
import spendUrl from "@zillions/sapling-params/sapling-spend.params?url";
import initZcore, { needs_sapling_params } from "@zillions/zcore";
import { sendTransaction } from "./lightwalletd";
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

/** Proves a signed PCZT in a worker: it takes tens of seconds. */
function prove(
  pczt: Uint8Array,
  sapling: SaplingParams | undefined,
  onStage: (stage: ProveStage) => void,
) {
  const worker = new ProveWorker();
  return new Promise<Proved>((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if ("stage" in data) onStage(data.stage);
      else if ("error" in data) reject(new Error(data.error));
      else resolve(data.ok);
    };
    worker.onerror = (e) => reject(new Error(e.message || "prover failed"));
    worker.postMessage({ pczt, sapling });
  }).finally(() => worker.terminate());
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
