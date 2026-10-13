import { expect, test, vi } from "vitest";

import type { ShieldedScan } from "../types";

vi.mock("../config", () => ({ NETWORK: "main" }));

const { backgroundPhase, newPoolScan, progressOf } = await import("./phases");

const TIP = 3_500_000;
test("a pool's segments split at the spam era, and the birthday bounds them all", () => {
  expect(newPoolScan("orchard", 3_080, 0)).toEqual({
    top: { floor: 2_868, from: 3_081, to: 3_080 },
    before: { floor: 0, from: 20, to: 19 },
    spam: { floor: 20, from: 2_868, to: 2_867 },
  });
  // A birthday inside the spam era: nothing before it, and less of it.
  const inSpam = newPoolScan("sapling", 4_515, 1_000);
  expect(inSpam.top.floor).toBe(4_386);
  expect(inSpam.before.floor > inSpam.before.from - 1).toBe(true);
  expect(inSpam.spam).toEqual({ floor: 1_000, from: 4_386, to: 4_385 });
  // Ironwood is younger than the spam era.
  expect(newPoolScan("ironwood", 43, 0).top.floor).toBe(0);
});

const scan = (): ShieldedScan => {
  const orchard = newPoolScan("orchard", 3_080, 0);
  const sapling = newPoolScan("sapling", 4_515, 0);
  orchard.top.from = 3_000;
  orchard.top.to = 3_080;
  sapling.top.from = 4_510;
  sapling.top.to = 4_515;
  return {
    scanned: { orchard, sapling },
    setupDone: false,
    sendsRead: [],
  };
};

test("setup's progress weighs a Sapling chunk double", () => {
  const s = scan();
  s.scanned.orchard!.setup = 2_981;
  s.scanned.sapling!.setup = 4_506;
  // Orchard 81 of 100 read; Sapling 6 of 10, counted twice.
  expect(progressOf(s, "setup", TIP).percentage).toBeCloseTo(
    ((81 + 2 * 6) / (100 + 2 * 10)) * 100,
  );
});

test("history counts what setup left and both spam-era sides, and dates the oldest top a pool still has left", () => {
  const s = scan();
  s.scanned.orchard!.setup = 3_000;
  s.scanned.sapling!.setup = 4_510;
  s.scanned.orchard!.oldestHeight = 3_100_000;
  s.scanned.sapling!.oldestHeight = 3_300_000;
  const now = 1_800_000_000_000;
  const { percentage, backTo } = progressOf(s, "history", TIP, now);
  expect(percentage).toBe(0);
  // Sapling lags: every pool is read back to its oldest height, no further.
  expect(backTo).toBe(now - (TIP - 3_300_000) * 75_000);

  s.scanned.orchard!.top.from = 2_868;
  s.scanned.sapling!.top.from = 4_386;
  // Every top done: read back to the spam era's end.
  expect(progressOf(s, "history", TIP, now).backTo).toBe(
    now - (TIP - 2_100_000) * 75_000,
  );
});

test("history leaves the spam era to a phase of its own, which runs only once the user starts it", () => {
  const s = scan();
  s.scanned.orchard!.setup = 3_000;
  s.scanned.sapling!.setup = 4_510;
  expect(backgroundPhase(s, TIP, true)).toBe("history");
  expect(backgroundPhase(s, TIP, false)).toBe("paused");

  for (const p of [s.scanned.orchard!, s.scanned.sapling!]) {
    p.top.from = p.top.floor;
    p.before.from = p.before.floor;
  }
  expect(progressOf(s, "history", TIP).percentage).toBe(100);
  expect(progressOf(s, "spam", TIP).percentage).toBe(0);
  // Save data only holds history back: the spam era waits for the user anyway.
  expect(backgroundPhase(s, TIP, false)).toBe("spam-off");

  s.spamSync = true;
  expect(backgroundPhase(s, TIP, true)).toBe("spam");
  for (const p of [s.scanned.orchard!, s.scanned.sapling!]) {
    p.spam.from = p.spam.floor;
  }
  expect(backgroundPhase(s, TIP, true)).toBe("done");
});
