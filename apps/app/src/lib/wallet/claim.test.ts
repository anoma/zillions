import { beforeEach, expect, test, vi } from "vitest";
import type { ChunkRequest, DecryptedNote } from "./types";

const chain = vi.hoisted(() => ({
  ironwood: 0,
  /** Chunk → the link's notes the worker finds in it. */
  hits: new Map<number, Partial<DecryptedNote>[]>(),
  spent: new Set<string>(),
  read: [] as number[],
}));

vi.mock("./config", () => ({ NETWORK: "test" }));
vi.mock("@zillions/zcore", () => ({
  default: vi.fn(async () => {}),
  link_info: vi.fn(() => ({ ufvk: "uview-link" })),
}));
vi.mock("./chain/indexer", () => ({
  CHUNK_SIZE: 16_384,
  lastChunk: (size: number) => Math.ceil(size / 16_384) - 1,
  fetchTreeSizes: async () => ({ ironwood: chain.ironwood }),
  fetchSpent: async (_pool: string, nfs: Uint8Array) => [
    chain.spent.has(Array.from(nfs, (b) => b.toString(16)).join(""))
      ? { height: 1, tx_index: 0 }
      : null,
  ],
}));
vi.mock("./shielded/crawl", () => ({
  chunkChannel: () => ({
    run: async ({ chunk, key }: ChunkRequest) => {
      expect(key).toEqual({ ufvk: "uview-link" });
      chain.read.push(chunk);
      return { chunk, hits: chain.hits.get(chunk) ?? [], sent: [] };
    },
    terminate: () => {},
  }),
}));

const { linkStatus } = await import("./claim");
const key = new Uint8Array(32);

beforeEach(() => {
  chain.ironwood = 3 * 16_384 + 5;
  chain.hits.clear();
  chain.spent.clear();
  chain.read = [];
});

test("a link not mined yet is on its way, read from its own chunk to the tip", async () => {
  expect(await linkStatus(key, 16_390)).toEqual({ state: "funding" });
  expect(chain.read).toEqual([1, 2, 3]);
});

test("its note, found late, is claimable", async () => {
  const note = { position: 2 * 16_384, value: 11_000, nf_mine: "ab" };
  chain.hits.set(2, [note]);
  expect(await linkStatus(key, 16_390)).toEqual({ state: "claimable", note });
  expect(chain.read).toEqual([1, 2]);
});

test("a spent note is claimed", async () => {
  chain.hits.set(1, [{ position: 16_390, value: 11_000, nf_mine: "ab" }]);
  chain.spent.add("ab");
  expect(await linkStatus(key, 16_390)).toEqual({ state: "claimed" });
});
