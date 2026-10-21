import { expect, test } from "vitest";

import { balances, spendable, walletData } from "./balance";
import type { OwnUtxo } from "./transparent";
import type { Note, PendingTx, Spend } from "./types";

const note = (
  nf: string,
  value: number,
  spend: Spend,
  pool: Note["pool"] = "ironwood",
): Note => ({
  id: nf,
  pool,
  scope: "external",
  value,
  nf_mine: nf,
  recipient: "u1ours",
  height: 3_000,
  tx_index: 1,
  output_index: 0,
  position: 0x1f,
  note: "",
  spend,
});

const utxo = (txid: string, value: number): OwnUtxo => ({
  address: "t1ours",
  txid,
  index: 0,
  value,
  height: 3_000,
  scope: "external",
  address_index: 0,
});

const pending: PendingTx[] = [
  {
    txid: "p",
    expiryHeight: 0,
    nullifiers: ["held"],
    outpoints: ["heldcoin:0"],
    change: 2_000,
  },
];

const notes = [
  note("free", 5_000, { status: "unspent" }),
  note("orchard", 3_000, { status: "unspent" }, "orchard"),
  note("held", 7_000, { status: "unspent" }),
  // Not checked to the tip yet: it may be spent.
  note("unchecked", 11_000, { status: "unchecked" }),
  note("spent", 13_000, {
    status: "spent",
    at: { height: 3_100, tx_index: 0 },
  }),
];
const utxos = [utxo("coin", 1_000), utxo("heldcoin", 4_000)];

test("only what's checked unspent and not held by a pending transaction is spendable", () => {
  const free = spendable(notes, utxos, pending);
  expect(free.notes.map((n) => n.nf_mine)).toEqual(["free", "orchard"]);
  expect(free.utxos.map((u) => u.txid)).toEqual(["coin"]);
});

test("balances include what pending transactions return, by pool, and nothing is available until zcore says so", () => {
  const unshield: PendingTx = {
    ...pending[0],
    change: 3_000,
    transparentChange: 1_000,
  };
  expect(balances(notes, utxos, [unshield])).toEqual({
    shielded: { balance: 10_000n, available: 8_000n, waiting: 2_000n },
    transparent: { balance: 2_000n, available: 1_000n, waiting: 1_000n },
    orchardBalance: 3_000n,
  });
});

test("available is what zcore can spend now; what it can later waits, and dust neither", () => {
  // 8,000 free: 4,000 spendable now, 2,500 once confirmed, the rest dust.
  const now = {
    shielded: { now: 4_000n, later: 6_500n },
    transparent: { now: 1_000n, later: 1_000n },
  };
  // A record from before the split: all of its change counts as shielded.
  expect(balances(notes, utxos, pending, now)).toEqual({
    shielded: { balance: 10_000n, available: 4_000n, waiting: 4_500n },
    transparent: { balance: 1_000n, available: 1_000n, waiting: 0n },
    orchardBalance: 3_000n,
  });
});

test("a note's txid comes from its block, or stands in from its position until fetched", () => {
  const free = spendable(notes, [], []);
  const named = walletData(
    3_200,
    free,
    new Map([[3_000, { txids: new Map([[1, "tx1"]]) }]]) as never,
  );
  const unnamed = walletData(3_200, free, new Map());
  expect(named.notes[0].txid).toBe("tx1");
  expect(unnamed.notes[0].txid).toBe("1f".padStart(64, "0"));
});
