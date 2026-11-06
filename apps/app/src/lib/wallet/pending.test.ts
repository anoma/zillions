import { expect, test, vi } from "vitest";
import type { PendingTx } from "./types";

vi.mock("./chain/lightwalletd", () => ({}));

const {
  held,
  pendingActivity,
  prunePending,
  confirmedAt,
  plan,
  progressAt,
  EXPIRY_MARGIN,
} = await import("./pending");

const tx = (txid: string, rest: Partial<PendingTx> = {}): PendingTx => ({
  txid,
  expiryHeight: 3_240,
  nullifiers: [],
  outpoints: [],
  change: 0,
  ...rest,
});

const none = { spent: new Set<string>(), mined: new Set<string>() };

test("a pending transaction holds the notes and coins it spends", () => {
  expect(
    held([
      tx("a", { nullifiers: ["nf1"], outpoints: ["t:0"] }),
      tx("b", { nullifiers: ["nf2"] }),
    ]),
  ).toEqual({ notes: new Set(["nf1", "nf2"]), coins: new Set(["t:0"]) });
});

test("a pending transaction is dropped once seen mined, from either side", () => {
  const pending = [tx("shielded", { nullifiers: ["nf1"] }), tx("coins")];
  expect(
    prunePending(pending, { ...none, spent: new Set(["nf1"]), tip: 3_200 }),
  ).toEqual([tx("coins")]);
  expect(
    prunePending(pending, { ...none, mined: new Set(["coins"]), tip: 3_200 }),
  ).toEqual([pending[0]]);
});

test("a pending transaction outlives its expiry by a margin, and one that never expires stays", () => {
  const pending = [tx("expiring"), tx("forever", { expiryHeight: 0 })];
  const at = (tip?: number) =>
    prunePending(pending, { ...none, tip }).map((p) => p.txid);

  expect(at(3_240 + EXPIRY_MARGIN)).toEqual(["expiring", "forever"]);
  expect(at(3_240 + EXPIRY_MARGIN + 1)).toEqual(["forever"]);
  // No tip yet: nothing can be called expired.
  expect(at(undefined)).toEqual(["expiring", "forever"]);
});

test("history lists pending transactions newest first, until mined", () => {
  const receipt = {
    tx_type: "Sent" as const,
    value: -3_000n,
    fee: 1_000n,
    from: { pool: "shielded" as const },
    to: { address: "zs1" },
  };
  const pending = [
    tx("old", { receipt }),
    tx("no receipt"),
    tx("new", { receipt }),
    tx("mined", { receipt }),
  ];
  expect(
    pendingActivity(pending, new Set(["mined"])).map((a) => [a.txid, a.status]),
  ).toEqual([
    ["new", "Pending"],
    ["old", "Pending"],
  ]);
});

test("a pending transaction counts the blocks it has left to be mined", () => {
  const receipt = {
    tx_type: "Sent" as const,
    value: -3_000n,
    fee: 1_000n,
    from: { pool: "shielded" as const },
    to: { address: "zs1" },
  };
  const pending = [
    tx("forever", { receipt, expiryHeight: 0 }),
    tx("expiring", { receipt }),
  ];
  const left = (tip?: number) =>
    pendingActivity(pending, new Set(), tip).map((a) => a.expires_in);

  expect(left(3_200)).toEqual([40, undefined]);
  expect(left(3_300)).toEqual([0, undefined]);
  expect(left(undefined)).toEqual([undefined, undefined]);
});

test("a mined transaction is confirmed at its first confirmation", () => {
  const mined = (tx_type: "Sent" | "Received", block_height: number) =>
    ({ tx_type, block_height, confirmations: 0, status: "Confirmed" }) as never;
  const history = [mined("Sent", 100), mined("Received", 100)];
  const at = (tip?: number) =>
    confirmedAt(history, tip).map(
      (a) => `${a.tx_type} ${a.status} ${a.confirmations}`,
    );

  expect(at(100)).toEqual(["Sent Confirmed 1", "Received Confirmed 1"]);
  expect(at(101)).toEqual(["Sent Confirmed 2", "Received Confirmed 2"]);
  // The indexer ahead of the tip read still counts it mined once.
  expect(at(99)).toEqual(["Sent Confirmed 1", "Received Confirmed 1"]);
  // No tip yet: history stays as the indexer has it.
  expect(at(undefined)).toEqual(["Sent Confirmed 0", "Received Confirmed 0"]);
});

test("a send plans 90 seconds, and is done once mined", () => {
  const sent = 1_000;
  const ms = (seconds: number) => (sent + seconds) * 1000;
  // `events` maps seconds after the broadcast to the confirmations seen then.
  const run = (events: [number, number][], seconds: number) => {
    let p = plan({ tx_type: "Sent", timestamp: sent }, ms(0));
    for (const [at, confirmations] of events)
      p = plan({ tx_type: "Sent", timestamp: sent, confirmations }, ms(at), p);
    return progressAt(p, ms(seconds));
  };

  // A block of 75 s and a 15 s tip check.
  expect(run([], 0)).toEqual({ percent: 0, minutes: 2 });
  expect(run([], 45)).toEqual({ percent: 50, minutes: 1 });
  expect(run([[60, 1]], 60)).toEqual({
    percent: undefined,
    minutes: undefined,
  });

  // Past the estimate the percent is gone for good.
  expect(run([], 120)).toEqual({ percent: undefined, minutes: undefined });
});
