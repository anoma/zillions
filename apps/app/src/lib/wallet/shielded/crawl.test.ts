import { expect, test, vi } from "vitest";

const workers: { terminate: ReturnType<typeof vi.fn> }[] = [];

// A worker that never answers: a chunk stays in flight until it's killed.
vi.mock("./worker.ts?worker", () => ({
  default: class {
    onmessage = null;
    onerror = null;
    postMessage = vi.fn();
    terminate = vi.fn();
    constructor() {
      workers.push(this);
    }
  },
}));

const zc = vi.hoisted(() => ({
  decryptCompact: vi.fn(),
  decryptFull: vi.fn(),
}));
vi.mock("../../keychain/keychain", () => ({ keychain: () => zc }));
vi.mock("../chain/indexer", () => ({
  fetchChunk: vi.fn(async (kind: string) =>
    new TextEncoder().encode(kind.slice(0, 3)),
  ),
}));

const { chunkChannel, crawlChunks } = await import("./crawl");

test("an abort kills the link's chunks in flight and ends the crawl quietly", async () => {
  const abort = new AbortController();
  const onChunk = vi.fn();
  const crawl = crawlChunks({
    key: { ufvk: "uview-link" },
    pool: "ironwood",
    from: 0,
    to: 9,
    signal: abort.signal,
    workers: () => 2,
    onChunk,
  });
  await vi.waitFor(() => expect(workers).toHaveLength(2));

  abort.abort();

  await expect(crawl).resolves.toBeUndefined();
  expect(onChunk).not.toHaveBeenCalled();
  workers.forEach((w) => expect(w.terminate).toHaveBeenCalled());
});

test("the account's chunks go to the keychain, and only hits are read in full", async () => {
  workers.length = 0;
  const compact = { count: 9, min_height: 100, from: 4, digest: "dd" };
  zc.decryptCompact.mockResolvedValueOnce({ ...compact, hits: [] });
  const channel = chunkChannel();
  const tried = { chunk: 7, count: 4, digest: "cc" };

  expect(
    await channel.run({
      key: { account: "u1" },
      chunk: 7,
      pool: "orchard",
      tried,
    }),
  ).toEqual({
    chunk: 7,
    hits: [],
    sent: [],
    minHeight: 100,
    tried: { chunk: 7, count: 9, digest: "dd" },
    skipped: 4,
  });
  expect(zc.decryptCompact).toHaveBeenCalledWith({
    account: "u1",
    pool: "orchard",
    chunk: 7,
    ciphertexts: btoa("cip"),
    tried: { count: 4, digest: "cc" },
  });
  expect(zc.decryptFull).not.toHaveBeenCalled();

  zc.decryptCompact.mockResolvedValueOnce({
    ...compact,
    hits: [{ index: 3 }, { index: 5 }],
  });
  zc.decryptFull.mockResolvedValueOnce({ hits: ["h"], sent: ["s"] });
  // Another chunk's notes tried say nothing of this one.
  const read = await channel.run({
    key: { account: "u1" },
    chunk: 8,
    pool: "orchard",
    tried,
  });
  expect(zc.decryptCompact).toHaveBeenLastCalledWith(
    expect.objectContaining({ chunk: 8, tried: undefined }),
  );
  expect(zc.decryptFull).toHaveBeenCalledWith({
    account: "u1",
    pool: "orchard",
    chunk: 8,
    ciphertexts: btoa("cip"),
    memos: btoa("mem"),
    // Only a sends read opens outgoing ciphertexts.
    outgoing: "",
    hits: [3, 5],
  });
  expect(read).toMatchObject({ chunk: 8, hits: ["h"], sent: ["s"] });
  expect(workers).toHaveLength(0);
});

test("a sends read skips the compact pass and opens the outgoing ciphertexts", async () => {
  zc.decryptCompact.mockClear();
  zc.decryptFull.mockResolvedValueOnce({ hits: [], sent: ["s"] });
  const read = await chunkChannel().run({
    key: { account: "u1" },
    chunk: 2,
    pool: "ironwood",
    sends: [1, 4],
  });
  expect(zc.decryptCompact).not.toHaveBeenCalled();
  expect(zc.decryptFull).toHaveBeenLastCalledWith(
    expect.objectContaining({
      chunk: 2,
      hits: [],
      outgoing: btoa("out"),
      sends: [1, 4],
    }),
  );
  expect(read).toEqual({ chunk: 2, hits: [], sent: ["s"] });
});

test("an abort ends a keychain read at once, without waiting for the keychain", async () => {
  zc.decryptCompact.mockReturnValueOnce(new Promise(() => {}));
  const abort = new AbortController();
  const read = chunkChannel(abort.signal).run({
    key: { account: "u1" },
    chunk: 3,
    pool: "orchard",
  });
  await vi.waitFor(() =>
    expect(zc.decryptCompact).toHaveBeenLastCalledWith(
      expect.objectContaining({ chunk: 3 }),
    ),
  );
  abort.abort(new Error("stopped"));
  await expect(read).rejects.toThrow("stopped");
});
