import { beforeEach, expect, test, vi } from "vitest";

const load = async () => ({
  ...(await import("./blockTime")),
  ...(await import("../pending")),
});

beforeEach(() => vi.resetModules());

test("target time counts each block at the spacing of its height", async () => {
  const { NU7, secondsBetween } = await load();
  expect(secondsBetween(NU7 - 11, NU7 - 1)).toBe(750);
  expect(secondsBetween(NU7 - 1, NU7 + 9)).toBe(250);
  expect(secondsBetween(NU7 - 2, NU7)).toBe(100);
  // Blossom: 150 seconds up to it.
  expect(secondsBetween(653_598, 653_600)).toBe(225);
});

test("the block time follows the tip", async () => {
  const { NU7, blockSeconds, sawTip, tipCheckMs } = await load();
  expect(blockSeconds()).toBe(75);
  sawTip(NU7 - 2);
  expect(tipCheckMs()).toBe(15_000);
  sawTip(NU7 - 1);
  expect(tipCheckMs()).toBe(5_000);
  // An older answer doesn't turn it back.
  sawTip(NU7 - 2);
  expect(blockSeconds()).toBe(25);
});

test("from NU7 a send plans 80 seconds and a payment received 9 blocks of 25", async () => {
  const { NU7, plan, sawTip } = await load();
  sawTip(NU7);
  expect(plan({ tx_type: "Sent", timestamp: 1 }, 1_000).until).toBe(81_000);
  expect(
    plan({ tx_type: "Received", timestamp: 1, confirmations: 1 }, 1_000).until,
  ).toBe(226_000);
});

test("a transaction built before NU7 can't be mined past it", async () => {
  const { NU7, minedBy, sawTip } = await load();
  sawTip(NU7 - 10);
  expect(minedBy(NU7 + 100_000)).toBe(NU7 - 1);
  expect(minedBy(NU7 - 5)).toBe(NU7 - 5);
  sawTip(NU7 - 1);
  expect(minedBy(NU7 + 119)).toBe(NU7 + 119);
});
