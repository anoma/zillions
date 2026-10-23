/**
 * What a PCZT summary adds up to: per-pool outputs, payments versus the
 * account's own change, and the amount the approval leads with.
 */
import type {
  PcztShieldedIo,
  PcztSummary,
  PcztTransparentIo,
} from "@zillions/types";

export type PcztIo = PcztTransparentIo | PcztShieldedIo;

export const outputPools = (summary: PcztSummary) =>
  [
    { pool: "Transparent", outputs: summary.transparentOutputs },
    { pool: "Sapling", outputs: summary.saplingOutputs },
    { pool: "Orchard", outputs: summary.orchardOutputs },
    { pool: "Ironwood", outputs: summary.ironwoodOutputs },
  ] as const;

export const poolFlows = (summary: PcztSummary) =>
  [
    {
      title: "Transparent",
      inputs: summary.transparentInputs,
      outputs: summary.transparentOutputs,
    },
    {
      title: "Sapling",
      inputs: summary.saplingInputs,
      outputs: summary.saplingOutputs,
    },
    {
      title: "Orchard",
      inputs: summary.orchardInputs,
      outputs: summary.orchardOutputs,
    },
    {
      title: "Ironwood",
      inputs: summary.ironwoodInputs,
      outputs: summary.ironwoodOutputs,
    },
  ] as const;

export const total = (ios: PcztIo[]): bigint =>
  ios.reduce((sum, io) => sum + BigInt(io.value ?? 0), 0n);

/** Outputs the account's viewing key doesn't prove are its own. */
export const payments = (summary: PcztSummary): PcztIo[] =>
  outputPools(summary).flatMap(({ outputs }) =>
    outputs.filter((o) => !o.mine)
  );

/** What each pool receives, for pools that receive anything. */
export const keptByPool = (summary: PcztSummary) =>
  outputPools(summary)
    .map(({ pool, outputs }) => ({ pool, value: total(outputs) }))
    .filter(({ value }) => value > 0n);

/** The amount paid out, or, when nothing is, the amount moved within the wallet. */
export const transferAmount = (summary: PcztSummary): bigint => {
  const paid = payments(summary);
  return paid.length > 0 ?
      total(paid)
    : total(outputPools(summary).flatMap(({ outputs }) => outputs));
};

/** Funded with a payment link, so its claimer receives exactly the link's amount. */
export const CLAIM_FEE = 10_000n;

// ZIP 317 charges 5_000 zatoshi per logical action, so honest fees stay far below this.
export const HIGH_FEE_ZATOSHI = 1_000_000n;

/** The fee is whatever the PCZT's creator leaves between inputs and outputs. */
export const isHighFee = (summary: PcztSummary): boolean =>
  BigInt(summary.fee) > HIGH_FEE_ZATOSHI;

export const flowCount = (summary: PcztSummary): number =>
  poolFlows(summary).reduce(
    (count, { inputs, outputs }) => count + inputs.length + outputs.length,
    0
  );

export const isEmpty = (summary: PcztSummary): boolean =>
  flowCount(summary) === 0;

export const summaryAsText = (summary: PcztSummary): string =>
  JSON.stringify(summary.raw, null, 2);
