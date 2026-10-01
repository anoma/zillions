import { expect, test } from "vitest";

import { type Block, outputPositions } from "./lightwalletd";

const none = { sapling: 0, orchard: 0, ironwood: 0 };

// Mainnet block 3,503,058: its transactions add 3, 1, 2, 2, 2 and 2 Ironwood
// notes, ending the Ironwood tree at 659,384.
const block: Block = {
  time: 0,
  txids: new Map(),
  saplingSpends: new Map(),
  treeSizes: { sapling: 73_980_053, orchard: 50_471_686, ironwood: 659_384 },
  outputs: new Map(
    [0, 1, 2, 7, 8, 11, 13, 3].map((index, i) => [
      index,
      { ...none, ironwood: [3, 1, 0, 2, 2, 2, 2, 0][i] },
    ]),
  ),
};

test("places a transaction's notes from the block's tree sizes", () => {
  const ironwood = (tx: number) =>
    outputPositions(block, tx).find((p) => p.pool === "ironwood");
  expect(ironwood(0)).toEqual({ pool: "ironwood", first: 659_372, count: 3 });
  expect(ironwood(7)).toEqual({ pool: "ironwood", first: 659_376, count: 2 });
  expect(ironwood(13)).toEqual({ pool: "ironwood", first: 659_382, count: 2 });
  // A pool the transaction doesn't touch: nothing to read there.
  expect(
    outputPositions(block, 7).find((p) => p.pool === "sapling")?.count,
  ).toBe(0);
});
