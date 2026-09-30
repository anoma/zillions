/**
 * Shielding: every transparent coin into the account's own Ironwood address.
 * The PCZT is created here from the viewing key, signed by the keychain, then
 * proven in a worker and broadcast through lightwalletd.
 */

import initZcore, { pczt_summary, shield_pczt } from "@zillions/zcore";
import { sendTransaction } from "./lightwalletd";
import ProveWorker from "./prove.ts?worker";
import type { OwnUtxo } from "./transparent";

const NETWORK = import.meta.env.VITE_ZCASH_NETWORK ?? "main";

export type ShieldProposal = {
  pczt: Uint8Array;
  /** What lands shielded, after the fee. */
  value: bigint;
  fee: bigint;
};

/** An unsigned PCZT for a transaction mined at `targetHeight`. */
export async function proposeShield(
  ufvk: string,
  account: { seedFingerprint: string; hdIndex: number },
  utxos: OwnUtxo[],
  targetHeight: number,
): Promise<ShieldProposal> {
  await initZcore();
  const pczt = shield_pczt(
    NETWORK,
    ufvk,
    account.seedFingerprint,
    account.hdIndex,
    utxos,
    targetHeight,
  );
  const summary = pczt_summary(NETWORK, pczt);
  return {
    pczt,
    value: BigInt(summary.orchardOutputs[0].value),
    fee: BigInt(summary.fee),
  };
}

/** Proves a signed PCZT off the UI thread: it takes tens of seconds. */
function prove(pczt: Uint8Array) {
  const worker = new ProveWorker();
  return new Promise<{ txid: string; raw: Uint8Array }>((resolve, reject) => {
    worker.onmessage = ({ data }) =>
      "error" in data ? reject(new Error(data.error)) : resolve(data.ok);
    worker.onerror = (e) => reject(new Error(e.message || "prover failed"));
    worker.postMessage(pczt);
  }).finally(() => worker.terminate());
}

/** Proves and broadcasts a signed PCZT; returns the transaction's id. */
export async function submitShield(signed: Uint8Array) {
  const { txid, raw } = await prove(signed);
  await sendTransaction(raw);
  return txid;
}
