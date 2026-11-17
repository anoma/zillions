import { describe, expect, it, vi } from "vitest";

const zcore = vi.hoisted(() => ({ ledgerTx: undefined as unknown }));
vi.mock("webextension-polyfill", () => ({ default: {} }));
vi.mock("@zillions/zcore", () => ({
  default: vi.fn(),
  pczt_ledger_transaction: () => zcore.ledgerTx,
}));

import { isPlaceholderFingerprint, ledgerTransaction, randomFingerprint } from "./zillions";

const named = () => new Uint8Array(32).fill(7);
const derivation = () => ({ signingPath: "m", pubkey: new Uint8Array(33), seedFingerprint: named() });

describe("ledgerTransaction", () => {
  it("sends the device zeros for every fingerprint the PCZT names", () => {
    zcore.ledgerTx = {
      global: {},
      transparentInputs: [{ derivation: derivation() }],
      transparentOutputs: [{ derivation: derivation() }, { derivation: null }],
      orchardBundle: { actions: [{ seedFingerprint: named() }] },
      ironwoodBundle: { actions: [{ seedFingerprint: named() }] },
    };
    const tx = ledgerTransaction("", 0);
    const zeros = new Uint8Array(32);
    expect(tx.transparentInputs[0].derivation.seedFingerprint).toEqual(zeros);
    expect(tx.transparentOutputs[0].derivation?.seedFingerprint).toEqual(zeros);
    expect(tx.transparentOutputs[1].derivation).toBeNull();
    expect(tx.orchardBundle?.actions[0].seedFingerprint).toEqual(zeros);
    expect(tx.ironwoodBundle?.actions[0].seedFingerprint).toEqual(zeros);
  });
});

describe("randomFingerprint", () => {
  it("is 32 random bytes in hex, never a placeholder", () => {
    const a = randomFingerprint();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(randomFingerprint());
    expect(isPlaceholderFingerprint(a)).toBe(false);
    expect(isPlaceholderFingerprint("00".repeat(32))).toBe(true);
    expect(isPlaceholderFingerprint("")).toBe(true);
  });
});
