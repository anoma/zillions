/**
 * Shielding: every transparent coin into the account's own Ironwood address.
 * The PCZT is created here from the viewing key, signed by the keychain, then
 * submitted (see `submit.ts`).
 */

import initZcore, { pczt_summary, shield_pczt } from "@zillions/zcore";
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
