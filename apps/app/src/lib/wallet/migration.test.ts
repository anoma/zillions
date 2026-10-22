import { expect, test } from "vitest";

import { type Migration, nextStep, transfersDone } from "./migration";

const FEE = 15_000;
const CENT = 1_000_000;

const plan = (over: Partial<Migration> = {}): Migration => ({
  tip: 100,
  transferFee: FEE,
  preparationFee: 80_000,
  left: 5_000,
  preparations: [{ height: 101 }],
  transfers: [
    { value: 5 * CENT, height: 400 },
    { value: CENT, height: 480 },
  ],
  ...over,
});

test("prepares notes for every transfer that has none", () => {
  expect(nextStep(plan(), [7 * CENT], new Set())).toEqual({
    kind: "preparation",
    index: 0,
    height: 101,
    parts: [5 * CENT, CENT],
  });
});

test("waits while a step sent is pending", () => {
  const m = plan({ preparations: [{ height: 101, txid: "p" }] });
  expect(nextStep(m, [7 * CENT], new Set(["p"]))).toEqual({ kind: "mining" });
});

test("sends each transfer from its note, in order", () => {
  const m = plan({ preparations: [{ height: 101, txid: "p" }] });
  const notes = [CENT + FEE, 5 * CENT + FEE, 5_000];
  expect(nextStep(m, notes, new Set())).toMatchObject({
    kind: "transfer",
    index: 0,
    value: 5 * CENT,
    exact: true,
  });
  m.transfers[0].txid = "t0";
  expect(nextStep(m, [CENT + FEE, 5_000], new Set())).toMatchObject({
    kind: "transfer",
    index: 1,
  });
  m.transfers[1].txid = "t1";
  expect(nextStep(m, [5_000], new Set(["t1"]))).toEqual({ kind: "mining" });
  expect(transfersDone(m, new Set(["t1"]))).toBe(1);
  expect(nextStep(m, [5_000], new Set())).toEqual({ kind: "done" });
});

test("one transfer with no preparation spends any note that covers it", () => {
  const m = plan({
    preparations: [],
    transfers: [{ value: CENT, height: 101 }],
  });
  expect(nextStep(m, [1_130_714], new Set())).toMatchObject({
    kind: "transfer",
    exact: false,
  });
});

test("asks to plan again once the notes are gone", () => {
  const m = plan({ preparations: [{ height: 101, txid: "p" }] });
  expect(nextStep(m, [5_000], new Set())).toEqual({ kind: "replan" });
});
