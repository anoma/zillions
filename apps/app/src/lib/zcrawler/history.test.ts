import { expect, test } from "vitest";

import { buildHistory } from "./history";
import type { Note } from "./types";

const note = (position: number, value: number, memo?: string): Note => ({
  id: `a_orchard_${position}`,
  pool: "orchard",
  scope: "internal",
  value,
  nf_mine: "",
  memo,
  recipient: "u1ours",
  height: 3_503_689,
  tx_index: 7,
  output_index: position,
  position,
  note: "",
  spent: false,
});

test("a transaction's memo is the one its notes carry, wherever it sits", () => {
  const memoOf = (notes: Note[]) =>
    buildHistory(notes, [], [], new Map())[0].memo;
  // An unshield's padding note, then its change.
  expect(memoOf([note(1, 0), note(2, 350_000)])).toBeUndefined();
  expect(memoOf([note(1, 0), note(2, 350_000, "thanks")])).toBe("thanks");
});
