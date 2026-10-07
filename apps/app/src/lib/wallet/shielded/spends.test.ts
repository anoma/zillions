import { expect, test, vi } from "vitest";

import type { Block } from "../chain/lightwalletd";
import type { Note, Spend } from "../types";

/** Nullifier chunks by index: which nullifiers each reveals, and whether it's full. */
const chunks = vi.hoisted(
  () => new Map<number, { nfs: string[]; frozen: boolean }>(),
);

vi.mock("@zillions/zcore", () => ({
  // The chunk index rides in the body's first byte.
  nullifiers_spent: (body: Uint8Array, nfs: Uint8Array) => {
    const { nfs: revealed, frozen } = chunks.get(body[0])!;
    const ours = Array.from({ length: nfs.length / 32 }, (_, i) =>
      nfs[i * 32].toString(16).padStart(2, "0"),
    );
    return {
      spent: ours.flatMap((nf, i) => (revealed.includes(nf) ? [i] : [])),
      frozen,
    };
  },
}));

vi.mock("../chain/indexer", () => ({
  fetchNullifierChunk: async (_pool: string, chunk: number) =>
    chunks.has(chunk) ? Uint8Array.of(chunk) : undefined,
}));

const { checkSaplingSpends, locateSaplingSpends, markUnspent, placeSpends } =
  await import("./spends");

/** A note whose nullifier is `byte` repeated; `nf` names it by that byte. */
const note = (
  byte: string,
  pool: Note["pool"],
  spend: Spend = { status: "unchecked" },
): Note => ({
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
  spend,
});

const statuses = (notes: Note[]) =>
  Object.fromEntries(notes.map((n) => [n.id, n.spend]));

test("a spend is placed on the pool's note it names, and the rest read to the tip are unspent", () => {
  const notes = [
    note("aa", "orchard"),
    note("bb", "orchard"),
    note("cc", "ironwood"),
  ];
  placeSpends(notes, "orchard", [
    { nf: "aa".repeat(32), height: 3_100, tx_index: 2 },
  ]);
  markUnspent(notes, "orchard");
  expect(statuses(notes)).toEqual({
    aa: { status: "spent", at: { height: 3_100, tx_index: 2 } },
    bb: { status: "unspent" },
    // Its pool isn't read to the tip yet.
    cc: { status: "unchecked" },
  });
});

test("Sapling spends are checked from the first nullifier chunk not checked, which moves past full ones only", async () => {
  chunks.clear();
  chunks.set(1, { nfs: ["aa"], frozen: true });
  chunks.set(2, { nfs: ["bb"], frozen: false });
  const notes = [
    note("aa", "sapling"),
    note("bb", "sapling"),
    note("cc", "sapling"),
  ];
  const scan = {
    percentage: 0,
    scanned: {},
    saplingNullifiers: 1,
    sendsRead: [],
  };

  await checkSaplingSpends(notes, scan, new AbortController().signal);

  expect(statuses(notes)).toEqual({
    aa: { status: "spent" },
    bb: { status: "spent" },
    cc: { status: "unspent" },
  });
  // Chunk 2 is still filling: the next sync reads it again.
  expect(scan.saplingNullifiers).toBe(2);
});

test("a Sapling spend is placed through a later block that reveals its nullifier", () => {
  const block = (spends: [string, number][]) =>
    ({ saplingSpends: new Map(spends) }) as Block;
  const notes = [
    note("aa", "sapling", { status: "spent" }),
    note("bb", "sapling", { status: "spent" }),
  ];
  locateSaplingSpends(
    notes,
    new Map([
      // Below the note: a nullifier can't be revealed before its note exists.
      [2_900, block([["bb".repeat(32), 1]])],
      [3_050, block([["aa".repeat(32), 4]])],
    ]),
  );
  expect(statuses(notes)).toEqual({
    aa: { status: "spent", at: { height: 3_050, tx_index: 4 } },
    bb: { status: "spent" },
  });
});
