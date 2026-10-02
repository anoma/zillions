import { expect, test } from "vitest";

import { buildHistory } from "./history";
import type { TransparentTx } from "./transparent";
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

test("our own transparent addresses show as the pool, others' as the address", () => {
  const ours = new Set(["t1internal", "t1default"]);
  const at = { height: 3_503_700, tx_index: 7 };
  const tx = (txid: string, rest: Partial<TransparentTx>): TransparentTx => ({
    txid,
    height: at.height,
    received: 0n,
    spent: 0n,
    ...rest,
  });
  const history = buildHistory(
    // An unshield: a note spent, its change, and 0.0001 to our internal address.
    [
      { ...note(1, 375_000), spent: at },
      { ...note(2, 350_000), ...at },
    ],
    [],
    [
      tx("unshield", { received: 10_000n, to: "t1internal" }),
      tx("received", { received: 5_000n, from: "t1someone", to: "t1default" }),
    ],
    new Map([
      [at.height, { txids: new Map([[at.tx_index, "unshield"]]) }],
    ]) as never,
    new Map(),
    ours,
  );
  const sides = (txid: string) => {
    const { tx_type, from, to } = history.find((r) => r.txid === txid)!;
    return { tx_type, from, to };
  };

  expect(sides("unshield")).toEqual({
    tx_type: "Unshielded",
    from: { pool: "shielded" },
    to: { pool: "transparent" },
  });
  expect(sides("received")).toEqual({
    tx_type: "Received",
    from: { address: "t1someone" },
    to: { pool: "transparent" },
  });
});
