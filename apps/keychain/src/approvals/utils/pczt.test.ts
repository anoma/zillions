import type { PcztSummary } from "@zillions/types";
import { describe, expect, it } from "vitest";

import { payments, transferAmount, unshielded } from "./pczt";

const summary = (parts: Partial<PcztSummary>): PcztSummary => ({
  transparentInputs: [],
  transparentOutputs: [],
  saplingInputs: [],
  saplingOutputs: [],
  orchardInputs: [],
  orchardOutputs: [],
  ironwoodInputs: [],
  ironwoodOutputs: [],
  fee: "15000",
  raw: null,
  ...parts,
});

const fromIronwood = {
  ironwoodInputs: [{ value: "200000" }],
  ironwoodOutputs: [{ value: "135000", mine: true }],
};

describe("unshielded", () => {
  it("is the amount an unshield to our own address makes transparent", () => {
    const unshield = summary({
      ...fromIronwood,
      transparentOutputs: [
        { address: "t1own", value: "50000", mine: true, path: { scope: 1, index: 0 } },
      ],
    });
    expect(unshielded(unshield)).toBe(50_000n);
    expect(transferAmount(unshield)).toBe(50_000n);
  });

  it("is 0 for an unshield redirected to someone else's address", () => {
    const redirected = summary({
      ...fromIronwood,
      transparentOutputs: [{ address: "t1them", value: "50000", mine: false }],
    });
    expect(unshielded(redirected)).toBe(0n);
    expect(payments(redirected)).toHaveLength(1);
  });

  it("is 0 for a shield", () => {
    const shield = summary({
      transparentInputs: [{ value: "200000" }],
      ironwoodOutputs: [{ value: "185000", mine: true }],
    });
    expect(unshielded(shield)).toBe(0n);
    expect(transferAmount(shield)).toBe(185_000n);
  });
});
