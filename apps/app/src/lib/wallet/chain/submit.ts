/**
 * The last leg of every transaction: the keychain builds, signs and proves
 * it, holding the keys that takes, and this page broadcasts it through
 * lightwalletd.
 */

import {
  base64ToBytes,
  type ProveStage as KeychainProveStage,
  type ProvedTx,
} from "@zillions/keychain-types";
import { minedBy } from "./blockTime";
import { sendTransaction } from "./lightwalletd";

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Proves but never broadcasts, for testing sends with real notes. Dev builds
 * only: `vite build` ignores it.
 */
const DRY_RUN = import.meta.env.DEV && import.meta.env.VITE_DRY_RUN === "true";
if (DRY_RUN) {
  console.log("[submit] dry run is on: sends are proven, never broadcast");
}

/** The slow steps of a submission, in order; any the transaction doesn't need are skipped. */
export type ProveStage = KeychainProveStage | "broadcast";

/**
 * Broadcasts a transaction the keychain proved; returns it raw, with its id
 * and expiry height.
 */
export async function broadcastTransaction(
  proved: ProvedTx,
  onStage: (stage: ProveStage) => void = () => {},
) {
  const raw = base64ToBytes(proved.raw);
  onStage("broadcast");
  if (DRY_RUN) {
    console.log(
      `[submit] dry run, not broadcast: txid ${proved.txid}, raw ${hex(raw)}`,
    );
    // Thrown, not returned: the wallet then holds no notes as spent.
    throw new Error("Dry run: the transaction was proven but not broadcast");
  }
  await sendTransaction(raw);
  return {
    txid: proved.txid,
    raw,
    expiryHeight: minedBy(proved.expiryHeight),
  };
}
