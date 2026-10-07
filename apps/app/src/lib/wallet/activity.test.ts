import { expect, test } from "vitest";

import { buildActivity, payments, sendingTxs } from "./activity";
import type { Block } from "./chain/lightwalletd";
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
  spend: { status: "unspent" },
});

test("a transaction's memo is the one its notes carry, wherever it sits", () => {
  const memoOf = (notes: Note[]) =>
    buildActivity(notes, [], [], new Map())[0].memo;
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
  const history = buildActivity(
    // An unshield: a note spent, its change, and 0.0001 to our internal address.
    [
      { ...note(1, 375_000), spend: { status: "spent", at } },
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

test("a transaction moving our own funds between pools is a migration", () => {
  const at = { height: 3_503_939, tx_index: 2 };
  const [migration] = buildActivity(
    // An Ironwood note spent; 30,000 lands in our Sapling, the rest is
    // Ironwood change after a 20,000 fee.
    [
      { ...note(1, 100_000), pool: "ironwood", spend: { status: "spent", at } },
      { ...note(2, 50_000), pool: "ironwood", ...at },
      { ...note(3, 30_000), pool: "sapling", scope: "external", ...at },
    ],
    [],
    [],
    new Map(),
  );
  expect(migration).toMatchObject({
    tx_type: "Migrated",
    value: 30_000n,
    fee: 20_000n,
    from: { pool: "ironwood" },
    to: { pool: "sapling" },
  });
});

const block = (overrides: Partial<Block>): Block => ({
  time: 0,
  txids: new Map(),
  saplingSpends: new Map(),
  treeSizes: { sapling: 0, orchard: 0, ironwood: 0 },
  outputs: new Map(),
  vout: new Map(),
  ...overrides,
});

test("our sending transactions are those that spent a note or a coin of ours", () => {
  const at = { height: 3_150, tx_index: 3 };
  const blocks = new Map([
    [3_160, block({ txids: new Map([[5, "tshield"]]) })],
  ]);
  const txs = sendingTxs(
    [
      { ...note(1, 150_000), spend: { status: "spent", at } },
      // Spent, but where isn't known yet.
      { ...note(2, 40_000), spend: { status: "spent" } },
      note(3, 30_000),
    ],
    [
      { txid: "tshield", height: 3_160, received: 0n, spent: 9_000n },
      { txid: "treceived", height: 3_160, received: 5_000n, spent: 0n },
    ],
    blocks,
  );
  expect([...txs.values()]).toEqual([at, { height: 3_160, tx_index: 5 }]);
});

test("a send's payment is what it paid to someone else's transparent address", () => {
  const at = { height: 3_150, tx_index: 3 };
  const out = (value: number, address: string) => ({
    value,
    script: new TextEncoder().encode(address),
  });
  const blocks = new Map([
    [
      at.height,
      block({
        txids: new Map([[3, "tx3"]]),
        // Paid out, and an unshield's padding to our own address.
        vout: new Map([[3, [out(100_000, "t1theirs"), out(0, "t1ours")]]]),
      }),
    ],
  ]);
  const paid = payments([at], blocks, new Set(["t1ours"]), (script) =>
    new TextDecoder().decode(script),
  );
  expect([...paid.values()]).toEqual([
    [{ value: 100_000, recipient: "t1theirs" }],
  ]);

  const history = buildActivity(
    [
      { ...note(1, 150_000), spend: { status: "spent", at } },
      { ...note(2, 30_000), ...at },
    ],
    [],
    [],
    blocks,
    paid,
  );
  expect(history.find((tx) => tx.txid === "tx3")).toMatchObject({
    txid: "tx3",
    tx_type: "Sent",
    value: -100_000n,
    to: { address: "t1theirs" },
    fee: 20_000n,
  });
});
