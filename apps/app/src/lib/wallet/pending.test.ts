import { expect, test, vi } from "vitest";
import type { PendingTx } from "./types";

vi.mock("./chain/lightwalletd", () => ({}));

const { held, pendingActivity, prunePending, EXPIRY_MARGIN } =
  await import("./pending");

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
