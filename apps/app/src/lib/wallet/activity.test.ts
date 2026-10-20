import { expect, test } from "vitest";

import { buildActivity, sendingTxs } from "./activity";
import type { Block } from "./chain/lightwalletd";
import type { ParsedTx, TransparentTx } from "./transparent";
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
    receiving: 0n,
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
      tx("received", { received: 5_000n, to: "t1default" }),
    ],
    new Map([
      [at.height, { txids: new Map([[at.tx_index, "unshield"]]) }],
    ]) as never,
    // Its sender, read off the input that spent their coin.
    new Map([
      [
        "received",
        full("received", {
          inputs: [{ txid: "prev", index: 0, address: "t1someone" }],
          outputs: [{ index: 0, value: 5_000, address: "t1default" }],
        }),
      ],
    ]),
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

test("a payment to our own address in the same pool is a send of what it paid", () => {
  const at = { height: 3_503_939, tx_index: 2 };
  const history = (paid: Note[]) =>
    buildActivity(
      [
        { ...note(1, 100_000), spend: { status: "spent", at } },
        { ...note(2, 80_000), ...at },
        ...paid,
      ],
      [],
      [],
      new Map(),
    )[0];
  // 10,000 to our own address, 80,000 change, a 10,000 fee.
  expect(
    history([{ ...note(3, 10_000), scope: "external", ...at }]),
  ).toMatchObject({
    tx_type: "Sent",
    value: -10_000n,
    fee: 10_000n,
    to: { pool: "shielded" },
  });
  // Paying someone else whose output wasn't recovered: only the change is ours.
  expect(history([])).toMatchObject({
    tx_type: "Sent",
    value: -20_000n,
    fee: 0n,
  });
});

const block = (overrides: Partial<Block>): Block => ({
  time: 0,
  txids: new Map(),
  treeSizes: { sapling: 0, orchard: 0, ironwood: 0 },
  outputs: new Map(),
  transparentInputs: [],
  ...overrides,
});

/** A transaction as `parse_transaction` reads it. */
const full = (txid: string, rest: Partial<ParsedTx> = {}): ParsedTx => ({
  txid,
  inputs: [],
  outputs: [],
  value_balance: 0,
  expiry_height: 0,
  ...rest,
});

test("our sending transactions are those that spent a note or a coin of ours", () => {
  const at = { height: 3_150, tx_index: 3 };
  const blocks = new Map([
    [3_160, block({ txids: new Map([[5, "tshield"]]) })],
  ]);
  const txs = sendingTxs(
    [{ ...note(1, 150_000), spend: { status: "spent", at } }, note(3, 30_000)],
    [
      {
        txid: "tshield",
        height: 3_160,
        received: 0n,
        receiving: 0n,
        spent: 9_000n,
      },
      {
        txid: "treceived",
        height: 3_160,
        received: 5_000n,
        receiving: 5_000n,
        spent: 0n,
      },
    ],
    blocks,
  );
  expect([...txs.values()]).toEqual([at, { height: 3_160, tx_index: 5 }]);
});

test("a send's payment is what it paid to someone else's transparent address", () => {
  const at = { height: 3_150, tx_index: 3 };
  const blocks = new Map([
    [at.height, block({ txids: new Map([[3, "tx3"]]) })],
  ]);
  // Paid out, and an unshield's padding to our own address.
  const tx3 = full("tx3", {
    outputs: [
      { index: 0, value: 100_000, address: "t1theirs" },
      { index: 1, value: 0, address: "t1ours" },
    ],
    value_balance: 120_000,
  });
  const history = buildActivity(
    [
      { ...note(1, 150_000), spend: { status: "spent", at } },
      { ...note(2, 30_000), ...at },
    ],
    [],
    [],
    blocks,
    new Map([["tx3", tx3]]),
    new Set(["t1ours"]),
  );
  expect(history.find((tx) => tx.txid === "tx3")).toMatchObject({
    txid: "tx3",
    tx_type: "Sent",
    value: -100_000n,
    to: { address: "t1theirs" },
    fee: 20_000n,
  });
});

test("a fetched send's fee is exact, even with a note it spent not found yet", () => {
  const at = { height: 3_150, tx_index: 3 };
  const blocks = new Map([
    [at.height, block({ txids: new Map([[3, "tx3"]]) })],
  ]);
  const sent = {
    id: "a_orchard_9",
    pool: "orchard" as const,
    value: 100_000,
    recipient: "u1theirs",
    position: 9,
    ...at,
  };
  const entry = (txs?: Map<string, ParsedTx>) =>
    buildActivity([{ ...note(2, 30_000), ...at }], [sent], [], blocks, txs)[0];

  expect(entry()).toMatchObject({ value: -100_000n, fee: 0n });
  // Shielded to shielded: all that leaves the pools is the fee.
  const tx3 = full("tx3", { value_balance: 15_000 });
  expect(entry(new Map([["tx3", tx3]]))).toMatchObject({
    value: -100_000n,
    fee: 15_000n,
  });
});

test("a send from transparent coins to a shielded address counts its payment once", () => {
  // Mainnet 61f4832b…: three coins (41,000) pay 16,000 to an Ironwood
  // receiver, recovered with the transparent OVK, and a 25,000 fee.
  const at = { height: 3_519_095, tx_index: 4 };
  const sent = {
    id: "a_ironwood_9",
    pool: "ironwood" as const,
    value: 16_000,
    recipient: "u1theirs",
    memo: "This is another memo",
    position: 9,
    ...at,
  };
  const spend = {
    txid: "tx",
    height: at.height,
    received: 0n,
    receiving: 0n,
    spent: 41_000n,
  };
  const blocks = new Map([
    [at.height, block({ txids: new Map([[at.tx_index, "tx"]]) })],
  ]);
  const entry = (notes: Note[], spent = 41_000n) =>
    buildActivity(notes, [sent], [{ ...spend, spent }], blocks)[0];

  expect(entry([])).toMatchObject({
    tx_type: "Sent",
    value: -16_000n,
    fee: 25_000n,
    from: { pool: "transparent" },
    to: { address: "u1theirs" },
    memo: "This is another memo",
  });
  // With 5,000 of shielded change, the fee is what's left over.
  expect(
    entry([{ ...note(10, 5_000), pool: "ironwood", ...at }], 46_000n),
  ).toMatchObject({ value: -16_000n, fee: 25_000n });
});
