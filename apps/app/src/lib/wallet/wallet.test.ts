import { beforeEach, expect, test, vi } from "vitest";

import type { Block } from "./chain/lightwalletd";
import type {
  ChunkRequest,
  ChunkWorkerSuccess,
  DecryptedNote,
  Note,
  Pool,
  Sent,
  WalletState,
} from "./types";

// A small chain, described per test: what each chunk holds, where
// nullifiers were spent, and the blocks history asks for.
const chain = vi.hoisted(() => ({
  sizes: { sapling: 0, orchard: 0, ironwood: 0 },
  hits: new Map<string, DecryptedNote[]>(),
  /** Nullifier → where it was spent, as the indexer's `/spent` says. */
  spentAt: new Map<string, { height: number; tx_index: number }>(),
  sent: new Map<string, Sent[]>(),
  blocks: new Map<number, Block>(),
  tip: 3_200,
  /** The build's `SETUP_CHUNKS`. */
  setup: { sapling: 0, orchard: 0, ironwood: 0 },
}));

/** The 32-byte nullifiers packed in `nfs`, as hex. */
const nullifiers = vi.hoisted(
  () => (nfs: Uint8Array) =>
    Array.from({ length: nfs.length / 32 }, (_, i) =>
      Array.from(nfs.subarray(i * 32, i * 32 + 32), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""),
    ),
);

const saved = vi.hoisted(() => ({
  notes: [] as Note[],
  sent: [] as Sent[],
  blocks: new Map<number, Block>(),
  state: undefined as WalletState | undefined,
}));

// No spam era: setup reads the whole small chain.
vi.mock("./config", () => ({ NETWORK: "test", SETUP_CHUNKS: chain.setup }));

vi.mock("@zillions/zcore", () => ({
  default: vi.fn(async () => {}),
  parse_transaction: vi.fn(),
  // Test scripts are their address, as text.
  script_address: vi.fn((_network: string, script: Uint8Array) =>
    new TextDecoder().decode(script),
  ),
  max_send: vi.fn(() => 0),
  spendable: vi.fn(() => ({ now: 0, later: 0 })),
  plan_send: vi.fn(),
  send_pczt: vi.fn(),
  plan_shield: vi.fn(),
  shield_pczt: vi.fn(),
  // A Ledger's viewing key holds Orchard and transparent keys only.
  ufvk_pools: vi.fn((_network: string, ufvk: string) =>
    ufvk === "uview-ledger"
      ? ["ironwood", "orchard"]
      : ["ironwood", "orchard", "sapling"],
  ),
}));

vi.mock("./shielded/crawl", () => ({
  crawlChunks: vi.fn(
    async (o: {
      pool: Pool;
      from: number;
      to: number;
      signal?: AbortSignal;
      onChunk: (r: ChunkWorkerSuccess) => void;
    }) => {
      for (let chunk = o.to; chunk >= o.from && !o.signal?.aborted; chunk--) {
        const hits = chain.hits.get(`${o.pool}:${chunk}`) ?? [];
        o.onChunk({ chunk, hits, sent: [] });
      }
    },
  ),
  workerChannel: vi.fn(() => ({ run: lookup, terminate: vi.fn() })),
}));

/** A sends read: what a chunk shows we sent. */
const lookup = vi.fn(async ({ pool, chunk }: ChunkRequest) => ({
  chunk,
  hits: [],
  sent: chain.sent.get(`${pool}:${chunk}`) ?? [],
}));

vi.mock("./chain/indexer", async (actual) => ({
  ...(await actual<typeof import("./chain/indexer")>()),
  fetchTreeSizes: vi.fn(async () => chain.sizes),
  firstChunkFrom: vi.fn(async () => 0),
  fetchSpent: vi.fn(async (_pool: Pool, nfs: Uint8Array) =>
    nullifiers(nfs).map((nf) => chain.spentAt.get(nf) ?? null),
  ),
}));

vi.mock("./chain/lightwalletd", async (actual) => ({
  ...(await actual<typeof import("./chain/lightwalletd")>()),
  fetchBlock: vi.fn(
    async (height: number) => chain.blocks.get(height) ?? block(),
  ),
  fetchLatestHeight: vi.fn(async () => chain.tip),
  fetchTransaction: vi.fn(async () => ({ data: new Uint8Array(), height: 0 })),
}));

vi.mock("./transparent", () => ({
  REORG_DEPTH: 100,
  cachedTransparent: vi.fn(async () => undefined),
  syncTransparent: vi.fn(async () => ({
    cache: {},
    view: { utxos: [], txs: [], addresses: new Set(["t1ours"]) },
  })),
  keepReserved: vi.fn(),
  nextInternalAddress: vi.fn(),
  reserveInternalAddress: vi.fn(),
}));

vi.mock("./chain/submit", () => ({ submitTransaction: vi.fn() }));

vi.mock("./store", async (actual) => ({
  emptyState: (await actual<typeof import("./store")>()).emptyState,
  storageKey: vi.fn(async () => ({})),
  loadState: vi.fn(async () => undefined),
  saveState: vi.fn(async (state: WalletState) => {
    saved.notes = structuredClone(state.notes);
    saved.sent = structuredClone(state.sent);
    saved.blocks = structuredClone(state.blocks);
    saved.state = structuredClone(state);
  }),
}));

const { Wallet } = await import("./wallet");
const zcore = await import("@zillions/zcore");
const { submitTransaction } = await import("./chain/submit");
const { cachedTransparent } = await import("./transparent");
type TransparentCache = import("./transparent").TransparentCache;
const { fetchBlock, fetchLatestHeight, fetchTransaction } =
  await import("./chain/lightwalletd");
const { fetchTreeSizes } = await import("./chain/indexer");
const store = await import("./store");
const { crawlChunks } = await import("./shielded/crawl");

function block(overrides: Partial<Block> = {}): Block {
  return {
    time: 0,
    txids: new Map(),
    treeSizes: { ...chain.sizes },
    outputs: new Map(),
    transparentInputs: [],
    ...overrides,
  };
}

const nf = (byte: string) => byte.repeat(32);

function note(pool: Pool, position: number, nf_mine: string): DecryptedNote {
  return {
    pool,
    scope: "external",
    value: 5_000,
    nf_mine,
    recipient: "u1ours",
    height: 3_000,
    tx_index: 1,
    output_index: 0,
    position,
    note: "",
  };
}

beforeEach(() => {
  Object.assign(chain, {
    sizes: { sapling: 0, orchard: 0, ironwood: 0 },
    tip: 3_200,
  });
  Object.assign(chain.setup, { sapling: 0, orchard: 0, ironwood: 0 });
  for (const map of [chain.hits, chain.spentAt, chain.sent, chain.blocks]) {
    map.clear();
  }
  lookup.mockClear();
});

test("places a note's spend from the indexer, and reads what it paid into another pool", async () => {
  chain.sizes = { sapling: 100, orchard: 3 * 16_384 + 10, ironwood: 0 };
  chain.hits.set("orchard:1", [note("orchard", 16_387, nf("aa"))]);
  chain.spentAt.set(nf("aa"), { height: 3_100, tx_index: 2 });
  // The spending transaction pays one Sapling note, the block's last.
  chain.blocks.set(
    3_100,
    block({
      txids: new Map([[2, "tx2"]]),
      outputs: new Map([[2, { sapling: 1, orchard: 2, ironwood: 0 }]]),
    }),
  );
  const payment = {
    pool: "sapling" as const,
    value: 4_000,
    recipient: "zs1theirs",
    height: 3_100,
    tx_index: 2,
    position: 99,
  };
  chain.sent.set("sapling:0", [payment as Sent]);

  const wallet = new Wallet({ id: "a", ufvk: "uview" });
  await wallet.sync();

  expect(saved.notes[0].spend).toEqual({
    status: "spent",
    at: { height: 3_100, tx_index: 2 },
  });
  // Neither chunk holds a note of ours: only the block points at them.
  expect(lookup).toHaveBeenCalledWith(
    expect.objectContaining({ pool: "orchard", chunk: 3, sends: true }),
  );
  expect(lookup).toHaveBeenCalledWith(
    expect.objectContaining({ pool: "sapling", chunk: 0, sends: true }),
  );
  expect(saved.sent).toEqual([expect.objectContaining(payment)]);
  expect((await wallet.getBalance()).shielded.balance).toBe(0n);
});

test("never reads a pool the viewing key has no key for, and still finishes", async () => {
  chain.sizes = { sapling: 2 * 16_384, orchard: 3 * 16_384, ironwood: 10 };
  // Setup ends at chunk 1: chunk 0 is history.
  chain.setup.orchard = chain.setup.sapling = 1;
  chain.hits.set("orchard:0", [note("orchard", 3, nf("ab"))]);
  chain.hits.set("sapling:0", [note("sapling", 3, nf("ac"))]);
  chain.spentAt.set(nf("ab"), { height: 3_100, tx_index: 2 });
  // The spend pays a Sapling note too.
  chain.blocks.set(
    3_100,
    block({
      txids: new Map([[2, "tx2"]]),
      outputs: new Map([[2, { sapling: 1, orchard: 1, ironwood: 0 }]]),
    }),
  );
  vi.mocked(crawlChunks).mockClear();

  const wallet = new Wallet({ id: "ledger", ufvk: "uview-ledger" });
  const progress: string[] = [];
  wallet.subscribeSyncProgress((p) => progress.push(p.phase));
  await wallet.sync();
  await vi.waitFor(() => expect(progress.at(-1)).toBe("done"));

  const pools = vi.mocked(crawlChunks).mock.calls.map(([o]) => o.pool);
  expect(pools).toContain("orchard");
  expect(pools).not.toContain("sapling");
  expect(lookup).not.toHaveBeenCalledWith(
    expect.objectContaining({ pool: "sapling" }),
  );
  expect(saved.notes.map((n) => n.pool)).toEqual(["orchard"]);
  expect(saved.state!.scan.scanned.sapling).toBeUndefined();
});

test("holds what a broadcast spends until it's mined or expires", async () => {
  chain.sizes = { sapling: 0, orchard: 2 * 16_384, ironwood: 0 };
  chain.hits.set("orchard:1", [note("orchard", 16_387, nf("bb"))]);

  const wallet = new Wallet({ id: "b", ufvk: "uview" });
  await wallet.sync();
  expect((await wallet.getBalance()).shielded.balance).toBe(5_000n);

  vi.mocked(submitTransaction).mockResolvedValue({
    txid: "t1",
    raw: new Uint8Array(),
    expiryHeight: 3_240,
  });
  vi.mocked(zcore.parse_transaction).mockReturnValue({
    inputs: [],
    outputs: [],
    nullifiers: [nf("bb")],
    value_balance: 1_000,
  });
  await wallet.submit(
    new Uint8Array(),
    { shielded: 1_000n, transparent: 0n },
    {
      tx_type: "Sent",
      value: -3_000n,
      fee: 1_000n,
      timestamp: 1,
      from: { pool: "shielded" },
      to: { address: "zs1" },
    },
  );
  expect((await wallet.getTransactionHistory())[0]).toMatchObject({
    txid: "t1",
    status: "Pending",
    value: -3_000n,
  });

  const pending = await wallet.getBalance();
  // The change counts in the balance, and waits to be spent.
  expect(pending.shielded).toEqual({
    balance: 1_000n,
    available: 0n,
    waiting: 1_000n,
  });
  await wallet.maxSend({ from: "shielded", to: "zs1", amount: 0n });
  expect(vi.mocked(zcore.max_send).mock.lastCall?.[1].notes).toEqual([]);

  // Never mined, and now well past its expiry.
  chain.tip = 3_300;
  await wallet.sync();
  const released = await wallet.getBalance();
  expect(released.shielded.balance).toBe(5_000n);
  expect(
    (await wallet.getTransactionHistory()).some((tx) => tx.txid === "t1"),
  ).toBe(false);
});

test("places a Sapling spend from the indexer", async () => {
  chain.sizes = { sapling: 16_384, orchard: 16_384, ironwood: 0 };
  chain.hits.set("sapling:0", [note("sapling", 5, nf("cc"))]);
  // Its change, received in the spending transaction.
  chain.hits.set("orchard:0", [
    { ...note("orchard", 9, nf("dd")), height: 3_050, tx_index: 4 },
  ]);
  chain.spentAt.set(nf("cc"), { height: 3_050, tx_index: 4 });

  const wallet = new Wallet({ id: "c", ufvk: "uview" });
  await wallet.sync();

  const sapling = saved.notes.find((n) => n.pool === "sapling");
  expect(sapling?.spend).toEqual({
    status: "spent",
    at: { height: 3_050, tx_index: 4 },
  });
  expect((await wallet.getBalance()).shielded.balance).toBe(5_000n);
});

test("keeps a Sapling-only send with no change in history once mined", async () => {
  chain.sizes = { sapling: 16_384, orchard: 16_384, ironwood: 0 };
  chain.hits.set("sapling:0", [note("sapling", 5, nf("ce"))]);
  const wallet = new Wallet({ id: "d", ufvk: "uview" });
  await wallet.sync();

  vi.mocked(submitTransaction).mockResolvedValue({
    txid: "t2",
    raw: new Uint8Array(),
    expiryHeight: 3_240,
  });
  vi.mocked(zcore.parse_transaction).mockReturnValue({
    inputs: [],
    outputs: [],
    nullifiers: [nf("ce")],
    value_balance: 1_000,
  });
  await wallet.submit(
    new Uint8Array(),
    { shielded: 0n, transparent: 0n },
    {
      tx_type: "Sent",
      value: -4_000n,
      fee: 1_000n,
      timestamp: 1,
      from: { pool: "shielded" },
      to: { address: "u1theirs" },
    },
  );

  // Mined at 3_210, paying one Orchard note and nothing back to us.
  chain.spentAt.set(nf("ce"), { height: 3_210, tx_index: 2 });
  chain.blocks.set(
    3_210,
    block({
      txids: new Map([[2, "t2"]]),
      outputs: new Map([[2, { sapling: 0, orchard: 1, ironwood: 0 }]]),
    }),
  );
  chain.sent.set("orchard:0", [
    {
      pool: "orchard",
      value: 4_000,
      recipient: "u1theirs",
      height: 3_210,
      tx_index: 2,
      position: 16_383,
    } as Sent,
  ]);
  await wallet.sync();

  const sends = (await wallet.getTransactionHistory()).filter(
    (tx) => tx.txid === "t2",
  );
  expect(sends).toEqual([
    expect.objectContaining({ tx_type: "Sent", value: -4_000n }),
  ]);
  expect(sends[0].block_height).toBe(3_210);
});

test("shows the transparent side as last synced before any sync answers", async () => {
  vi.mocked(store.loadState).mockResolvedValueOnce({
    ...store.emptyState("f"),
    // The transparent sync parsed it: its input names the sender.
    transparent: {
      txs: [
        {
          txid: "t",
          height: 3_000,
          inputs: [{ txid: "prev", index: 0, address: "t1someone" }],
          outputs: [{ index: 0, value: 5_000, address: "t1ours" }],
          value_balance: 0,
          expiry_height: 0,
        },
      ],
    } as unknown as TransparentCache,
  });
  vi.mocked(cachedTransparent).mockResolvedValueOnce({
    utxos: [],
    txs: [
      {
        txid: "t",
        height: 3_000,
        received: 5_000n,
        receiving: 5_000n,
        spent: 0n,
        to: "t1ours",
      },
    ],
    addresses: new Set(["t1ours"]),
  });

  const wallet = new Wallet({ id: "f", ufvk: "uview" });

  await vi.waitFor(async () =>
    expect(await wallet.getTransactionHistory()).toEqual([
      expect.objectContaining({
        tx_type: "Received",
        from: { address: "t1someone" },
        to: { pool: "transparent" },
      }),
    ]),
  );
});

test("reads history only once storage is loaded", async () => {
  vi.mocked(store.loadState).mockResolvedValueOnce({
    ...store.emptyState("g"),
    notes: [
      {
        ...note("orchard", 7, nf("ab")),
        id: "g_orchard_7",
        spend: { status: "unspent" },
      },
    ],
  });
  const wallet = new Wallet({ id: "g", ufvk: "uview" });
  expect(await wallet.getTransactionHistory()).toHaveLength(1);
});

test("stores a recent block, and fetches it again each sync", async () => {
  chain.sizes = { sapling: 0, orchard: 2 * 16_384, ironwood: 0 };
  // Mined 50 blocks below the tip: a reorg could still replace it.
  chain.hits.set("orchard:1", [
    { ...note("orchard", 16_387, nf("cd")), height: 3_150 },
  ]);
  const wallet = new Wallet({ id: "h", ufvk: "uview" });
  const fetches = () =>
    vi.mocked(fetchBlock).mock.calls.filter(([h]) => h === 3_150).length;
  const before = fetches();

  await wallet.sync();
  await wallet.sync();

  expect(fetches() - before).toBe(2);
  expect(saved.blocks.has(3_150)).toBe(true);
});

test("fetches a transaction in full once, and not again after a reload", async () => {
  chain.sizes = { sapling: 0, orchard: 2 * 16_384, ironwood: 0 };
  // Paid us from transparent coins: read for its sender.
  chain.hits.set("orchard:1", [
    { ...note("orchard", 16_387, nf("fa")), height: 3_150 },
  ]);
  chain.blocks.set(
    3_150,
    block({ txids: new Map([[1, "tx1"]]), transparentInputs: [1] }),
  );
  vi.mocked(zcore.parse_transaction).mockReturnValue({
    txid: "tx1",
    inputs: [],
    outputs: [],
    value_balance: 0,
    expiry_height: 0,
  });
  const fetches = () =>
    vi.mocked(fetchTransaction).mock.calls.filter(([id]) => id === "tx1")
      .length;
  const before = fetches();

  await new Wallet({ id: "i", ufvk: "uview" }).sync();
  expect(fetches() - before).toBe(1);

  vi.mocked(store.loadState).mockResolvedValueOnce(saved.state);
  const reloaded = new Wallet({ id: "i", ufvk: "uview" });
  await reloaded.sync();
  await reloaded.sync();
  expect(fetches() - before).toBe(1);
});

test("never asks for a shielded payment received by its txid", async () => {
  chain.sizes = { sapling: 0, orchard: 2 * 16_384, ironwood: 0 };
  chain.hits.set("orchard:1", [
    { ...note("orchard", 16_387, nf("fb")), height: 3_150 },
  ]);
  chain.blocks.set(3_150, block({ txids: new Map([[1, "tx2"]]) }));

  await new Wallet({ id: "j", ufvk: "uview" }).sync();
  const asked = vi.mocked(fetchTransaction).mock.calls.map(([txid]) => txid);
  expect(asked).not.toContain("tx2");
});

test("names and dates what a chunk finds before the crawl ends", async () => {
  chain.sizes = { sapling: 100, orchard: 2 * 16_384, ironwood: 0 };
  chain.hits.set("orchard:1", [note("orchard", 16_387, nf("ef"))]);
  chain.blocks.set(
    3_000,
    block({ time: 1_700_000_000, txids: new Map([[1, "tx1"]]) }),
  );
  // Sapling, crawled last, never finishes.
  const crawl = vi.mocked(crawlChunks).getMockImplementation()!;
  vi.mocked(crawlChunks).mockImplementation((o) =>
    o.pool === "sapling" ? new Promise(() => {}) : crawl(o),
  );
  const wallet = new Wallet({ id: "i", ufvk: "uview" });
  void wallet.sync();

  await vi.waitFor(async () =>
    expect(await wallet.getTransactionHistory()).toEqual([
      expect.objectContaining({ txid: "tx1", timestamp: 1_700_000_000 }),
    ]),
  );
  vi.mocked(crawlChunks).mockImplementation(crawl);
});

test("crawls newest-first, and a later sync reads the chunks minted since and the history left", async () => {
  chain.sizes = { sapling: 0, orchard: 3 * 16_384, ironwood: 0 };
  chain.hits.set("orchard:0", [note("orchard", 3, nf("a1"))]);
  const read: number[] = [];
  const crawl = vi.mocked(crawlChunks).getMockImplementation()!;
  // The first sync fails after chunk 2.
  vi.mocked(crawlChunks).mockImplementation(async (o) => {
    o.onChunk({ chunk: o.to, hits: [], sent: [] });
    read.push(o.to);
    throw new Error("network");
  });
  const wallet = new Wallet({ id: "j", ufvk: "uview" });
  await expect(wallet.sync()).rejects.toThrow("network");
  expect((await wallet.getBalance()).shielded.balance).toBe(0n);

  chain.sizes.orchard = 5 * 16_384;
  vi.mocked(crawlChunks).mockImplementation(async (o) => {
    for (let chunk = o.to; chunk >= o.from; chunk--) read.push(chunk);
    return crawl(o);
  });
  await wallet.sync();
  vi.mocked(crawlChunks).mockImplementation(crawl);

  // Those minted since down to chunk 2 again (it may have been filling), then below.
  expect(read).toEqual([2, 4, 3, 2, 1, 0]);
  expect((await wallet.getBalance()).shielded.balance).toBe(5_000n);
});

test("history waits while the browser saves data, then reads what setup left once asked", async () => {
  chain.sizes = { sapling: 0, orchard: 3 * 16_384, ironwood: 0 };
  chain.hits.set("orchard:0", [note("orchard", 3, nf("b1"))]);
  // Setup ends at Orchard chunk 2: chunks 1 and 0 are history.
  chain.setup.orchard = 2;
  Object.defineProperty(navigator, "connection", {
    value: { saveData: true },
    configurable: true,
  });
  const wallet = new Wallet({ id: "k", ufvk: "uview" });
  const phases: string[] = [];
  wallet.subscribeSyncProgress((p) => phases.push(p.phase));

  await wallet.sync();
  expect(phases.at(-1)).toBe("paused");
  expect((await wallet.getBalance()).shielded.balance).toBe(0n);

  wallet.downloadHistory();
  await vi.waitFor(() => expect(phases.at(-1)).toBe("done"));
  expect(phases).toContain("history");
  expect((await wallet.getBalance()).shielded.balance).toBe(5_000n);

  Object.defineProperty(navigator, "connection", { value: undefined });
  chain.setup.orchard = 0;
});

test("syncs again a minute after a sync ends, never queuing one behind a slow sync", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const tips = vi.mocked(fetchLatestHeight);
  tips.mockClear();
  // The first sync takes five minutes: the tip answers late.
  let answer = () => {};
  tips.mockImplementationOnce(
    () => new Promise((resolve) => (answer = () => resolve(chain.tip))),
  );
  const syncs = vi.mocked(fetchTreeSizes);
  syncs.mockClear();
  const wallet = new Wallet({ id: "r", ufvk: "uview" });

  const first = wallet.sync();
  await vi.advanceTimersByTimeAsync(5 * 60_000);
  expect(tips).toHaveBeenCalledTimes(1);
  answer();
  await first;
  expect(syncs).toHaveBeenCalledTimes(1);

  // Checked every 15 s meanwhile, the tip stays put.
  await vi.advanceTimersByTimeAsync(59_000);
  expect(syncs).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(syncs).toHaveBeenCalledTimes(2);

  wallet.free();
  vi.useRealTimers();
});

test("syncs as soon as a check finds a new block", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const syncs = vi.mocked(fetchTreeSizes);
  const wallet = new Wallet({ id: "b", ufvk: "uview" });
  await wallet.sync();
  syncs.mockClear();

  await vi.advanceTimersByTimeAsync(15_000);
  expect(syncs).not.toHaveBeenCalled();
  chain.tip += 1;
  await vi.advanceTimersByTimeAsync(15_000);
  expect(syncs).toHaveBeenCalledTimes(1);

  wallet.free();
  vi.useRealTimers();
  chain.tip -= 1;
});

test("holds the timed sync while history runs, and syncs once it ends", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  chain.sizes = { sapling: 0, orchard: 3 * 16_384, ironwood: 0 };
  // Setup ends at Orchard chunk 2: history reads chunks 1 and 0, until released.
  chain.setup.orchard = 2;
  const crawl = vi.mocked(crawlChunks).getMockImplementation()!;
  let release = () => {};
  vi.mocked(crawlChunks).mockImplementation(async (o) => {
    if (o.to === 1) {
      await new Promise<void>((resolve) => {
        release = resolve;
        o.signal?.addEventListener("abort", () => resolve());
      });
    }
    return crawl(o);
  });
  const syncs = vi.mocked(fetchTreeSizes);
  syncs.mockClear();
  const wallet = new Wallet({ id: "h", ufvk: "uview" });

  await wallet.sync();
  await vi.advanceTimersByTimeAsync(3 * 60_000);
  wallet.resync();
  await vi.advanceTimersByTimeAsync(0);
  expect(syncs).toHaveBeenCalledTimes(1);

  release();
  await vi.advanceTimersByTimeAsync(15_000);
  expect(syncs).toHaveBeenCalledTimes(2);
  wallet.resync();
  await vi.advanceTimersByTimeAsync(0);
  expect(syncs).toHaveBeenCalledTimes(3);

  wallet.free();
  vi.useRealTimers();
  chain.setup.orchard = 0;
  vi.mocked(crawlChunks).mockImplementation(crawl);
});

test("catch-up hands the newest chunk's tried notes to its next read", async () => {
  chain.sizes = { sapling: 0, orchard: 100, ironwood: 0 };
  const crawl = vi.mocked(crawlChunks).getMockImplementation()!;
  vi.mocked(crawlChunks).mockImplementation(async (o) =>
    crawl({
      ...o,
      onChunk: (r) =>
        o.onChunk({
          ...r,
          tried: { chunk: r.chunk, count: chain.sizes.orchard, digest: "d" },
        }),
    }),
  );
  const wallet = new Wallet({ id: "t", ufvk: "uview" });
  await wallet.sync();

  vi.mocked(crawlChunks).mockClear();
  // A new object, as the indexer's answer is: the last sync's sizes stay as read.
  chain.sizes = { ...chain.sizes, orchard: 150 };
  await wallet.sync();
  const [catchUp] = vi.mocked(crawlChunks).mock.calls[0];
  expect([catchUp.from, catchUp.to, catchUp.tried]).toEqual([
    0,
    0,
    { chunk: 0, count: 100, digest: "d" },
  ]);

  wallet.free();
  vi.mocked(crawlChunks).mockImplementation(crawl);
});
