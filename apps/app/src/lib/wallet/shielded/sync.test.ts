import { expect, test, vi } from "vitest";

import type { Pool, WalletState } from "../types";

vi.mock("../config", () => ({ NETWORK: "main" }));
vi.mock("@zillions/zcore", () => ({}));
vi.mock("./spends", () => ({ checkSpends: vi.fn() }));
vi.mock("./crawl", () => ({
  crawlChunks: vi.fn(),
  workerChannel: vi.fn(),
}));

const { crawlChunks } = await import("./crawl");
const { newPoolScan } = await import("./phases");
const { crawlHistory } = await import("./sync");

test("history reads what setup left, then before the spam era, then the spam era, each in pool order", async () => {
  const last = { ironwood: 43, orchard: 3_080, sapling: 4_515 };
  const setup = { ironwood: 0, orchard: 3_006, sapling: 4_505 };
  const scanned = Object.fromEntries(
    (["ironwood", "orchard", "sapling"] as Pool[]).map((pool) => {
      const p = newPoolScan(pool, last[pool], 0);
      p.top = { ...p.top, from: setup[pool], to: last[pool] };
      return [pool, { ...p, setup: setup[pool] }];
    }),
  );
  const state = {
    id: "a",
    notes: [],
    sent: [],
    scan: { scanned, setupDone: true, sendsRead: [] },
  } as unknown as WalletState;

  await crawlHistory(
    {
      state,
      tip: 3_500_000,
      workers: () => 2,
      signal: new AbortController().signal,
      onAdvance: () => {},
    } as never,
    { ironwood: 44 * 16_384, orchard: 3_081 * 16_384, sapling: 4_516 * 16_384 },
  );

  const reads = vi
    .mocked(crawlChunks)
    .mock.calls.map(([o]) => [o.pool, o.from, o.to])
    .filter(([, from, to]) => (to as number) >= (from as number));
  expect(reads).toEqual([
    ["orchard", 2_868, 3_005],
    ["sapling", 4_386, 4_504],
    ["orchard", 0, 19],
    ["sapling", 0, 71],
    ["orchard", 20, 2_867],
    ["sapling", 72, 4_385],
  ]);
});
