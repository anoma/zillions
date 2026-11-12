import { expect, test, vi } from "vitest";

const workers: { terminate: ReturnType<typeof vi.fn> }[] = [];
// The amount of time the mock worker takes to fulfil a chunk request
let timeout: number = 0;

// A worker that never answers: a chunk stays in flight until it's killed.
vi.mock("./worker.ts?worker", () => ({
  default: class {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror = null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    postMessage(_msg: unknown) {
      // The delay allows us to simulate workers of different speeds
      setTimeout(() => {
        this.onmessage!({ data: {} });
      }, timeout);
    }
    terminate = vi.fn();
    constructor() {
      workers.push(this);
    }
  },
}));
vi.mock("./gpu", () => ({ gpuSecrets: vi.fn() }));

const { config, crawlChunks } = await import("./crawl");
const { gpuSecrets } = await vi.importActual<typeof import("./gpu")>("./gpu");

test("an abort kills the chunks in flight and ends the crawl quietly", async () => {
  // Clear workers inherited from other tests
  workers.length = 0;
  // Make the mock worker take this long to process ChunkRequests
  timeout = 500;
  // Cut off workers that take longer than this to process requests
  config.DECRYPTION_TIMEOUT_MS = 1000;
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
  // The immediate abort means that no chunks could have been processed
  expect(onChunk).not.toHaveBeenCalled();
  workers.forEach((w) => expect(w.terminate).toHaveBeenCalled());
  // In the absence of timeouts, only two workers are needed
  expect(workers.length).toBe(2);
});

test("the chunks are fetched and the crawl terminates successfully", async () => {
  // Clear workers inherited from other tests
  workers.length = 0;
  // Make the mock worker take this long to process ChunkRequests
  timeout = 500;
  // Cut off workers that take longer than this to process requests
  config.DECRYPTION_TIMEOUT_MS = 1000;
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

  await expect(crawl).resolves.toBeUndefined();
  // Since abort is never called, all chunks should successfully complete
  expect(onChunk).toHaveBeenCalledTimes(10);
  workers.forEach((w) => expect(w.terminate).toHaveBeenCalled());
  // In the absence of timeouts, only two workers are needed
  expect(workers.length).toBe(2);
});

test("test that fetches that exceed timeouts are automatically retried", async () => {
  // Clear workers inherited from other tests
  workers.length = 0;
  // Make the mock worker take this long to process ChunkRequests
  timeout = 1000;
  // Cut off workers that take longer than this to process requests
  config.DECRYPTION_TIMEOUT_MS = 500;
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
  // At the two second mark, get the workers to speed up their processing
  setTimeout(() => {
    timeout = 250;
  }, 2000);

  await expect(crawl).resolves.toBeUndefined();
  // Since abort is never called, all chunks should eventually complete
  expect(onChunk).toHaveBeenCalledTimes(10);
  workers.forEach((w) => expect(w.terminate).toHaveBeenCalled());
  // If retries happened as expected, then more than two workers were created
  expect(workers.length).toBe(10);
});

test("a GPU job whose crawl aborted while it queued never runs", async () => {
  await expect(
    gpuSecrets("ironwood", new Uint8Array(128), AbortSignal.abort()),
  ).rejects.toMatchObject({ name: "AbortError" });
});
