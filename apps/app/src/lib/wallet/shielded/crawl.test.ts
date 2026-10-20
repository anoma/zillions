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
vi.mock("./gpu", () => ({ gpuSecrets: vi.fn() }));

const { crawlChunks } = await import("./crawl");
const { gpuSecrets } = await vi.importActual<typeof import("./gpu")>("./gpu");

test("an abort kills the chunks in flight and ends the crawl quietly", async () => {
  const abort = new AbortController();
  const onChunk = vi.fn();
  const crawl = crawlChunks({
    ufvk: "uview",
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

test("a GPU job whose crawl aborted while it queued never runs", async () => {
  await expect(
    gpuSecrets("ironwood", new Uint8Array(128), AbortSignal.abort()),
  ).rejects.toMatchObject({ name: "AbortError" });
});
