import { beforeEach, expect, test, vi } from "vitest";

import type { Block } from "./lightwalletd";
import type {
  ChunkRequest,
  ChunkWorkerSuccess,
  DecryptedNote,
  Note,
  Pool,
  Sent,
} from "./types";

// A small chain, described per test: what each chunk holds, which records
// spend what, and the blocks history asks for.
const chain = vi.hoisted(() => ({
  sizes: { sapling: 0, orchard: 0, ironwood: 0 },
  hits: new Map<string, DecryptedNote[]>(),
  /** `pool:chunk` → record index → the nullifier it spends. */
  rho: new Map<string, Map<number, string>>(),
  /** Nullifier → where it was spent, as the spend's `/memos` record says. */
  spentAt: new Map<string, { height: number; tx_index: number }>(),
  sent: new Map<string, Sent[]>(),
  blocks: new Map<number, Block>(),
  saplingNullifiers: [] as string[],
  tip: 3_200,
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

const saved = vi.hoisted(() => ({ notes: [] as Note[], sent: [] as Sent[] }));

vi.mock("@zillions/zcore", () => ({
  default: vi.fn(async () => {}),
  // The chunk number rides in the body's first byte.
  find_spends: vi.fn((pool: Pool, body: Uint8Array, nfs: Uint8Array) => {
    const ours = new Set(nullifiers(nfs));
    const records = chain.rho.get(`${pool}:${body[0]}`) ?? new Map();
    return Uint32Array.from(
      [...records].filter(([, nf]) => ours.has(nf)).map(([i]) => i),
    );
  }),
  nullifiers_spent: vi.fn((_body: Uint8Array, nfs: Uint8Array) => {
    return {
      spent: nullifiers(nfs).flatMap((nf, i) =>
        chain.saplingNullifiers.includes(nf) ? [i] : [],
      ),
      frozen: false,
    };
  }),
  parse_transaction: vi.fn(),
  // Test scripts are their address, as text.
  script_address: vi.fn((_network: string, script: Uint8Array) =>
    new TextDecoder().decode(script),
  ),
  max_send: vi.fn(() => 0),
  plan_send: vi.fn(),
  send_pczt: vi.fn(),
  plan_shield: vi.fn(),
  shield_pczt: vi.fn(),
}));

vi.mock("./crawl", () => ({
  crawlChunks: vi.fn(
    async (o: {
      pool: Pool;
      from: number;
      to: number;
      onChunk: (r: ChunkWorkerSuccess) => void;
    }) => {
      for (let chunk = o.from; chunk <= o.to; chunk++) {
        const key = `${o.pool}:${chunk}`;
        o.onChunk({
          chunk,
          hits: chain.hits.get(key) ?? [],
          sent: [],
          spends: [],
          body: Uint8Array.of(chunk),
        });
      }
    },
  ),
  workerChannel: vi.fn(() => ({ run: lookup, terminate: vi.fn() })),
}));

/** A spend lookup or a sends read: the chunk revisited in full. */
const lookup = vi.fn(async ({ pool, chunk, spends = [] }: ChunkRequest) => {
  const records = chain.rho.get(`${pool}:${chunk}`) ?? new Map();
  return {
    chunk,
    hits: [],
    sent: chain.sent.get(`${pool}:${chunk}`) ?? [],
    spends: spends.map((i) => {
      const nf = records.get(i)!;
      return { nf, ...chain.spentAt.get(nf)! };
    }),
    body: Uint8Array.of(chunk),
  };
});

vi.mock("./indexer", async (actual) => ({
  ...(await actual<typeof import("./indexer")>()),
  fetchTreeSizes: vi.fn(async () => chain.sizes),
  firstChunkFrom: vi.fn(async () => 0),
  fetchNullifierChunk: vi.fn(async (_pool: Pool, chunk: number) =>
    chunk === 0 ? new Uint8Array() : undefined,
  ),
}));

vi.mock("./lightwalletd", async (actual) => ({
  ...(await actual<typeof import("./lightwalletd")>()),
  fetchBlock: vi.fn(
    async (height: number) => chain.blocks.get(height) ?? block(),
  ),
}));

vi.mock("./transparent", () => ({
  REORG_DEPTH: 100,
  cachedTransparent: vi.fn(async () => undefined),
  syncTransparent: vi.fn(async () => ({
    utxos: [],
    txs: [],
    tip: chain.tip,
    addresses: new Set(["t1ours"]),
  })),
  nextUnshield: vi.fn(),
  reserveUnshield: vi.fn(),
}));

vi.mock("./submit", () => ({ submitTransaction: vi.fn() }));

vi.mock("./db", () => ({
  loadNotes: vi.fn(async () => []),
  loadSent: vi.fn(async () => []),
  loadSyncStatus: vi.fn(async () => undefined),
  loadBlocks: vi.fn(async (heights: number[]) => heights.map(() => undefined)),
  saveBlocks: vi.fn(async () => {}),
  saveSyncState: vi.fn(async (notes: Note[], sent: Sent[]) => {
    saved.notes = structuredClone(notes);
    saved.sent = structuredClone(sent);
  }),
}));

const { ZWallet } = await import("./ZWallet");
const zcore = await import("@zillions/zcore");
const { submitTransaction } = await import("./submit");
const { cachedTransparent } = await import("./transparent");

function block(overrides: Partial<Block> = {}): Block {
  return {
    time: 0,
    txids: new Map(),
    saplingSpends: new Map(),
    treeSizes: { ...chain.sizes },
    outputs: new Map(),
    vout: new Map(),
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
    saplingNullifiers: [],
  });
  for (const map of [
    chain.hits,
    chain.rho,
    chain.spentAt,
    chain.sent,
    chain.blocks,
  ]) {
    map.clear();
  }
  lookup.mockClear();
});

test("finds a spend of an earlier note in chunk order, and what it paid into another pool", async () => {
  chain.sizes = { sapling: 100, orchard: 3 * 16_384 + 10, ironwood: 0 };
  chain.hits.set("orchard:1", [note("orchard", 16_387, nf("aa"))]);
  chain.rho.set("orchard:3", new Map([[7, nf("aa")]]));
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

  const wallet = new ZWallet({ id: "a", ufvk: "uview" });
  await wallet.sync();

  expect(saved.notes[0].spent).toEqual({ height: 3_100, tx_index: 2 });
  expect(lookup).toHaveBeenCalledWith(
    expect.objectContaining({ pool: "orchard", chunk: 3, spends: [7] }),
  );
  // Sapling chunk 0 holds nothing of ours: only the block points at it.
  expect(lookup).toHaveBeenCalledWith(
    expect.objectContaining({ pool: "sapling", chunk: 0, spends: [] }),
  );
  expect(saved.sent).toEqual([expect.objectContaining(payment)]);
  expect((await wallet.getBalance()).shieldedBalance).toBe(0n);
});

test("holds what a broadcast spends until it's mined or expires", async () => {
  chain.sizes = { sapling: 0, orchard: 2 * 16_384, ironwood: 0 };
  chain.hits.set("orchard:1", [note("orchard", 16_387, nf("bb"))]);

  const wallet = new ZWallet({ id: "b", ufvk: "uview" });
  await wallet.sync();
  expect((await wallet.getBalance()).shieldedBalance).toBe(5_000n);

  vi.mocked(submitTransaction).mockResolvedValue({
    txid: "t1",
    raw: new Uint8Array(),
    expiryHeight: 3_240,
  });
  vi.mocked(zcore.parse_transaction).mockReturnValue({
    inputs: [],
    nullifiers: [nf("bb")],
  });
  await wallet.submit(new Uint8Array(), 1_000n);

  const pending = await wallet.getBalance();
  expect([pending.shieldedBalance, pending.pendingChange]).toEqual([
    0n,
    1_000n,
  ]);
  await wallet.maxSend({ from: "shielded", to: "zs1", amount: 0n });
  expect(vi.mocked(zcore.max_send).mock.lastCall?.[1].notes).toEqual([]);

  // Never mined, and now well past its expiry.
  chain.tip = 3_300;
  await wallet.sync();
  const released = await wallet.getBalance();
  expect([released.shieldedBalance, released.pendingChange]).toEqual([
    5_000n,
    0n,
  ]);
});

test("places a Sapling spend through our own transaction's block", async () => {
  chain.sizes = { sapling: 16_384, orchard: 16_384, ironwood: 0 };
  chain.hits.set("sapling:0", [note("sapling", 5, nf("cc"))]);
  // Its change, received in the spending transaction.
  chain.hits.set("orchard:0", [
    { ...note("orchard", 9, nf("dd")), height: 3_050, tx_index: 4 },
  ]);
  chain.saplingNullifiers = [nf("cc")];
  chain.blocks.set(3_050, block({ saplingSpends: new Map([[nf("cc"), 4]]) }));

  const wallet = new ZWallet({ id: "c", ufvk: "uview" });
  await wallet.sync();

  const sapling = saved.notes.find((n) => n.pool === "sapling");
  expect(sapling?.spent).toEqual({ height: 3_050, tx_index: 4 });
  expect((await wallet.getBalance()).shieldedBalance).toBe(5_000n);
});

test("counts what a send paid to someone else's transparent address, not to ours", async () => {
  chain.sizes = { sapling: 0, orchard: 2 * 16_384, ironwood: 0 };
  const spentIn = (tx_index: number) => ({ height: 3_150, tx_index });
  chain.hits.set("orchard:1", [
    { ...note("orchard", 16_387, nf("ee")), value: 150_000 },
    { ...note("orchard", 16_388, nf("ff")), value: 40_000 },
    // tx 3's change.
    { ...note("orchard", 16_390, nf("aa")), ...spentIn(3), value: 30_000 },
  ]);
  chain.rho.set(
    "orchard:1",
    new Map([
      [9, nf("ee")],
      [10, nf("ff")],
    ]),
  );
  chain.spentAt.set(nf("ee"), spentIn(3));
  chain.spentAt.set(nf("ff"), spentIn(4));
  const out = (value: number, address: string) => ({
    value,
    script: new TextEncoder().encode(address),
  });
  chain.blocks.set(
    3_150,
    block({
      txids: new Map([
        [3, "tx3"],
        [4, "tx4"],
      ]),
      vout: new Map([
        [3, [out(100_000, "t1theirs")]],
        // An unshield: its output is our own.
        [4, [out(25_000, "t1ours")]],
      ]),
    }),
  );

  const wallet = new ZWallet({ id: "e", ufvk: "uview" });
  await wallet.sync();

  const history = await wallet.getTransactionHistory();
  expect(history.find((tx) => tx.txid === "tx3")).toMatchObject({
    tx_type: "Sent",
    value: -100_000n,
    to: { address: "t1theirs" },
    fee: 20_000n,
  });
  expect(history.find((tx) => tx.txid === "tx4")?.to).not.toHaveProperty(
    "address",
  );
});

test("shows the transparent side as last synced before any sync answers", async () => {
  vi.mocked(cachedTransparent).mockResolvedValueOnce({
    utxos: [],
    txs: [
      {
        txid: "t",
        height: 3_000,
        received: 5_000n,
        spent: 0n,
        from: "t1someone",
        to: "t1ours",
      },
    ],
    addresses: new Set(["t1ours"]),
  });

  const wallet = new ZWallet({ id: "f", ufvk: "uview" });

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
