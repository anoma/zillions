import { expect, test, vi } from "vitest";

import type { Note, Pool, TxLocator } from "../types";

/** Where the indexer saw each nullifier, by its first byte as hex. */
const spent = vi.hoisted(() => new Map<string, TxLocator>());

vi.mock("../chain/indexer", () => ({
  SPENT_BATCH: 2,
  fetchSpent: vi.fn(async (_pool: Pool, nfs: Uint8Array) =>
    Array.from(
      { length: nfs.length / 32 },
      (_, i) => spent.get(nfs[i * 32].toString(16).padStart(2, "0")) ?? null,
    ),
  ),
}));

const { fetchSpent } = await import("../chain/indexer");
const { checkSpends } = await import("./spends");

/** A note whose nullifier is `byte` repeated, with `byte` as its id. */
const note = (byte: string, pool: Pool): Note => ({
  id: byte,
  pool,
  scope: "external",
  value: 5_000,
  nf_mine: byte.repeat(32),
  recipient: "u1ours",
  height: 3_000,
  tx_index: 1,
  output_index: 0,
  position: 0,
  note: "",
  spend: { status: "unchecked" },
});

test("each note is marked spent where the indexer saw it, or unspent, asked per pool in batches", async () => {
  spent.set("bb", { height: 3_100, tx_index: 2 });
  spent.set("dd", { height: 3_200, tx_index: 0 });
  const notes = [
    note("aa", "orchard"),
    note("bb", "orchard"),
    note("cc", "orchard"),
    note("dd", "sapling"),
  ];

  await checkSpends(notes, new AbortController().signal);

  expect(Object.fromEntries(notes.map((n) => [n.id, n.spend]))).toEqual({
    aa: { status: "unspent" },
    bb: { status: "spent", at: { height: 3_100, tx_index: 2 } },
    cc: { status: "unspent" },
    dd: { status: "spent", at: { height: 3_200, tx_index: 0 } },
  });
  expect(
    vi.mocked(fetchSpent).mock.calls.map(([pool, nfs]) => [pool, nfs.length]),
  ).toEqual([
    ["orchard", 64],
    ["orchard", 32],
    ["sapling", 32],
  ]);
});
