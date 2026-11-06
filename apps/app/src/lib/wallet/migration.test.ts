import { expect, test } from "vitest";

import {
  type Migration,
  nextStep,
  readyAt,
  sendAt,
  stepSent,
  transfersDone,
} from "./migration";

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

const at = (height: number, ...values: number[]) =>
  values.map((value) => ({ value, height }));

test("a note can anchor from a bucket past the boundary above it", () => {
  // Mined at 1,000: boundary 1,008, anchorable once the newest boundary under
  // one confirmation is 1,152, i.e. from tip 1,152.
  expect(readyAt(1_000)).toBe(1_152);
  expect(readyAt(1_008)).toBe(1_152);
  expect(readyAt(1_009)).toBe(1_296);
});

test("boundaries are 432 blocks apart from NU7, as zcore's `anchorable` counts", () => {
  expect(readyAt(3_543_205)).toBe(3_543_696);
  expect(readyAt(3_543_300)).toBe(3_544_128);
  expect(readyAt(3_543_505)).toBe(3_544_128);
});

test("prepares notes for every transfer that has none", () => {
  expect(nextStep(plan(), at(50, 7 * CENT), new Set())).toEqual({
    kind: "preparation",
    index: 0,
    height: 101,
    parts: [5 * CENT, CENT],
    readyAt: readyAt(50),
  });
});

test("waits while a step sent is pending", () => {
  const m = plan({ preparations: [{ height: 101, txid: "p" }] });
  expect(nextStep(m, at(50, 7 * CENT), new Set(["p"]))).toEqual({
    kind: "mining",
  });
});

test("sends each transfer from its note, in order, once it can anchor", () => {
  const m = plan({ preparations: [{ height: 101, txid: "p" }] });
  const notes = [...at(110, CENT + FEE, 5 * CENT + FEE), ...at(50, 5_000)];
  expect(nextStep(m, notes, new Set())).toEqual({
    kind: "transfer",
    index: 0,
    height: 400,
    value: 5 * CENT,
    readyAt: readyAt(110),
  });
  m.transfers[0].txid = "t0";
  expect(nextStep(m, at(110, CENT + FEE), new Set())).toMatchObject({
    kind: "transfer",
    index: 1,
  });
  m.transfers[1].txid = "t1";
  expect(nextStep(m, at(50, 5_000), new Set(["t1"]))).toEqual({
    kind: "mining",
  });
  expect(transfersDone(m, new Set(["t1"]))).toBe(1);
  expect(nextStep(m, at(50, 5_000), new Set())).toEqual({ kind: "done" });
});

test("asks to plan again once the notes are gone", () => {
  const m = plan({ preparations: [{ height: 101, txid: "p" }] });
  expect(nextStep(m, at(50, 5_000), new Set())).toEqual({ kind: "replan" });
});

test("a step sent late shifts the rest; one sent early doesn't", () => {
  const m = plan();
  stepSent(m, "preparation", 0, "p", 160);
  expect(m.transfers.map((t) => t.height)).toEqual([460, 540]);
  stepSent(m, "transfer", 0, "t0", 300);
  expect(m.transfers.map((t) => t.height)).toEqual([460, 540]);
  expect(m.preparations[0]).toEqual({ height: 101, txid: "p" });
});

test("a step is due when planned or once its funds anchor, whichever is later", () => {
  const step = { kind: "transfer", index: 0, value: CENT } as const;
  expect(sendAt({ ...step, height: 2_000, readyAt: 1_154 })).toBe(2_000);
  expect(sendAt({ ...step, height: 1_100, readyAt: 1_154 })).toBe(1_155);
});
