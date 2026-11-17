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
const { checkSpends } = await import("./spends");
const { newPoolScan } = await import("./phases");
const { crawlHistory, recoverSends } = await import("./sync");

test("a sends read reads only authored transactions' outputs, across chunks and pools, each chunk once, and keeps ours as notes, spend-checked", async () => {
  // Our tx at 3_000 #1: Ironwood outputs at 16_383 and 16_384 (two chunks),
  // and one Sapling output at 7. Our tx #2: Ironwood output 16_385.
  const at = { height: 3_000, tx_index: 1 };
  const output = (pool: Pool, position: number, recipient: string) => ({
    ...at,
    pool,
    position,
    recipient,
    value: 1_000,
  });
  const change = {
    ...output("ironwood", 16_384, "u1me"),
    scope: "internal" as const,
    nf_mine: "aa",
    output_index: 1,
    note: "",
  };
  const state = {
    id: "a",
    notes: [],
    sent: [],
    blocks: new Map([
      [
        3_000,
        {
          treeSizes: { ironwood: 16_386, orchard: 0, sapling: 8 },
          outputs: new Map([
            [1, { ironwood: 2, orchard: 0, sapling: 1 }],
            [2, { ironwood: 1, orchard: 0, sapling: 0 }],
          ]),
        },
      ],
    ]),
    scan: { scanned: { ironwood: {}, sapling: {} }, sendsRead: [] },
  } as unknown as WalletState;
  const reads = {
    "ironwood:0": { hits: [], sent: [output("ironwood", 16_383, "u1them")] },
    "ironwood:1": { hits: [change], sent: [] },
    "sapling:0": { hits: [], sent: [output("sapling", 7, "zs1them")] },
  };
  const lookup = vi.fn(
    async ({
      pool,
      chunk,
    }: {
      pool: Pool;
      chunk: number;
      sends?: number[];
    }) => ({
      chunk,
      ...reads[`${pool}:${chunk}` as keyof typeof reads],
    }),
  );
  const signal = new AbortController().signal;
  const run = {
    ufvk: "uview1",
    pools: ["ironwood", "orchard", "sapling"],
    state,
    applied: new Set<string>(),
    lookups: { run: lookup },
    onFound: () => {},
    signal,
  } as never;
  const sizes = { ironwood: 16_386, orchard: 0, sapling: 8 };
  const txs = new Map([
    ["3000:1", at],
    ["3000:2", { ...at, tx_index: 2 }],
  ]);

  await recoverSends(run, sizes, txs);

  expect(lookup.mock.calls.map(([r]) => [r.pool, r.chunk, r.sends])).toEqual([
    ["sapling", 0, [7]],
    ["ironwood", 0, [16_383]],
    ["ironwood", 1, [0, 1]],
  ]);
  expect(state.notes.map((n) => n.id)).toEqual(["a_ironwood_16384"]);
  expect(state.sent.map((s) => s.recipient)).toEqual(["zs1them", "u1them"]);
  expect(state.scan.sendsRead).toEqual(["3000:1", "3000:2"]);
  // The crawl won't check it: it's already applied when the crawl reaches its chunk.
  expect(checkSpends).toHaveBeenCalledWith(state.notes, signal);

  // Read once: a later sync doesn't read them again.
  await recoverSends(run, sizes, txs);
  expect(lookup).toHaveBeenCalledTimes(3);
  expect(checkSpends).toHaveBeenCalledTimes(1);
});

test("history reads what setup left, then before the spam era, and the spam era is a run of its own, each in pool order", async () => {
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

  const run = {
    pools: ["ironwood", "orchard", "sapling"],
    state,
    tip: 3_500_000,
    workers: () => 2,
    signal: new AbortController().signal,
    onAdvance: () => {},
  } as never;
  const sizes = {
    ironwood: 44 * 16_384,
    orchard: 3_081 * 16_384,
    sapling: 4_516 * 16_384,
  };
  const reads = () => {
    const calls = vi
      .mocked(crawlChunks)
      .mock.calls.map(([o]) => [o.pool, o.from, o.to])
      .filter(([, from, to]) => (to as number) >= (from as number));
    vi.mocked(crawlChunks).mockClear();
    return calls;
  };

  await crawlHistory(run, sizes, "history");
  expect(reads()).toEqual([
    ["orchard", 2_868, 3_005],
    ["sapling", 4_386, 4_504],
    ["orchard", 0, 19],
    ["sapling", 0, 71],
  ]);

  await crawlHistory(run, sizes, "spam");
  expect(reads()).toEqual([
    ["orchard", 20, 2_867],
    ["sapling", 72, 4_385],
  ]);
});
