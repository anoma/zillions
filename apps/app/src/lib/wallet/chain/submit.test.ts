import { beforeEach, expect, it, vi } from "vitest";
import type { ProveRequest, ProveResponse } from "./prove";

/** Stands in for the prove worker: records what it's sent, replies on demand. */
class FakeWorker {
  static all: FakeWorker[] = [];
  sent: ProveRequest[] = [];
  terminated = false;
  onmessage: ((e: { data: ProveResponse }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(msg: ProveRequest) {
    this.sent.push(msg);
  }
  reply(data: ProveResponse) {
    this.onmessage?.({ data });
  }
  terminate() {
    this.terminated = true;
  }
}

vi.mock("./prove.ts?worker", () => ({ default: FakeWorker }));
vi.mock("@zillions/zcore", () => ({
  default: vi.fn(async () => {}),
  needs_sapling_params: vi.fn(() => false),
}));
vi.mock("./lightwalletd", () => ({ sendTransaction: vi.fn(async () => {}) }));

const proved = { txid: "ab", raw: new Uint8Array([1]), expiry_height: 9 };
const tick = () => new Promise((resolve) => setTimeout(resolve));

// Each test gets a fresh module: the prove worker is module state.
let submit: typeof import("./submit");
beforeEach(async () => {
  FakeWorker.all = [];
  vi.resetModules();
  submit = await import("./submit");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

it("warms once, and a proof sent mid-warm-up waits on the keys", async () => {
  submit.warmProver();
  submit.warmProver();
  expect(FakeWorker.all).toHaveLength(1);
  const [worker] = FakeWorker.all;

  const stages: string[] = [];
  const done = submit.submitTransaction(new Uint8Array([7]), (s) =>
    stages.push(s),
  );
  await tick();
  expect(stages).toEqual(["proving-key"]);
  expect(worker.sent).toEqual([
    { warm: true },
    { pczt: new Uint8Array([7]), sapling: undefined },
  ]);

  worker.reply({ warmed: 16_000 });
  worker.reply({ stage: "ironwood-proof" });
  worker.reply({ ok: proved });
  await expect(done).resolves.toMatchObject({ txid: "ab", expiryHeight: 9 });
  expect(stages).toEqual(["proving-key", "ironwood-proof", "broadcast"]);
  expect(worker.terminated).toBe(false);
});

it("fails a waiting proof when the warm-up fails, and starts over after", async () => {
  submit.warmProver();
  const done = submit.submitTransaction(new Uint8Array([7]));
  await tick();
  FakeWorker.all[0].reply({ warmFailed: "out of memory" });
  await expect(done).rejects.toThrow("out of memory");
  expect(FakeWorker.all[0].terminated).toBe(true);

  submit.warmProver();
  expect(FakeWorker.all).toHaveLength(2);
});

it("drops the worker after a warm-up fails with no proof waiting", () => {
  submit.warmProver();
  FakeWorker.all[0].reply({ warmFailed: "trap" });
  expect(FakeWorker.all[0].terminated).toBe(true);
  expect(console.warn).toHaveBeenCalledWith("[prover] warm-up failed: trap");
});

it("builds the keys before a proof that had no warm-up", async () => {
  const stages: string[] = [];
  void submit.submitTransaction(new Uint8Array([7]), (s) => stages.push(s));
  await tick();
  expect(FakeWorker.all).toHaveLength(1);
  expect(FakeWorker.all[0].sent[0]).toEqual({ warm: true });
  expect(stages).toEqual(["proving-key"]);
});

it("proves with the parameters prefetched before approval, fetched once", async () => {
  const zcore = await import("@zillions/zcore");
  vi.mocked(zcore.needs_sapling_params).mockReturnValue(true);
  // Each file's one byte picks the hash its check expects.
  const hashes = [
    "8e48ffd23abb3a5fd9c5589204f32d9c31285a04b78096ba40a79b75677efc13",
    "2f0ebbcbb9bb0bcffe95a397e7eba89c29eb4dde6191c339db88570e3f3fb0e4",
  ];
  const fetch = vi.fn(
    async (url: string) =>
      new Response(new Uint8Array([url.includes("spend") ? 0 : 1])),
  );
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(crypto.subtle, "digest").mockImplementation(
    async (_, data) =>
      Uint8Array.from(hashes[(data as Uint8Array)[0]].match(/../g)!, (b) =>
        parseInt(b, 16),
      ).buffer,
  );

  submit.prefetchSaplingParams(new Uint8Array([7]));
  await tick();
  expect(fetch).toHaveBeenCalledTimes(2);

  void submit.submitTransaction(new Uint8Array([7]));
  await tick();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(FakeWorker.all[0].sent[1]).toEqual({
    pczt: new Uint8Array([7]),
    sapling: { spend: new Uint8Array([0]), output: new Uint8Array([1]) },
  });
  vi.unstubAllGlobals();
});
