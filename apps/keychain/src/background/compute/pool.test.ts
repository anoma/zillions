import { beforeAll, expect, it, vi } from "vitest";

vi.mock("./gpu", () => ({ gpuSecrets: vi.fn() }));

/** Workers that hold every message until the test answers it. */
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  terminated = false;
  constructor(readonly url: string) {
    FakeWorker.all.push(this);
  }
  postMessage() {}
  terminate() {
    this.terminated = true;
  }
  reply(data: unknown) {
    this.onmessage?.({ data });
  }
}
const busy = (url: string) =>
  FakeWorker.all.find((w) => w.url === url && !w.terminated)!;

let pool: typeof import("./pool");
beforeAll(async () => {
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("navigator", { hardwareConcurrency: 1 });
  pool = await import("./pool");
});

const compact = {
  op: "compact",
  ufvk: "uview",
  pool: "orchard",
  chunk: 0,
  body: "",
  from: 0,
  tried: "",
} as const;

it("stops proofs and leaves chunk reads running", async () => {
  const read = pool.runJob(compact, () => {});
  const proof = pool.runJob({ op: "prove", pczt: "" }, () => {});
  await vi.waitFor(() => expect(busy("/prove-worker.js")).toBeDefined());

  pool.stopProving();
  await expect(proof).rejects.toThrow("Keychain is locked");
  busy("/decrypt-worker.js").reply({ ok: { hits: [] } });
  expect(await read).toEqual({ hits: [] });
});

it("stops chunk reads too on a full stop", async () => {
  const read = pool.runJob(compact, () => {});
  pool.stopAll();
  await expect(read).rejects.toThrow("Keychain is locked");
});

it("drops a threaded proof that stops answering, and its worker", async () => {
  vi.stubGlobal("crossOriginIsolated", true);
  vi.useFakeTimers();
  try {
    const proof = pool.runJob({ op: "prove", pczt: "" }, () => {});
    await vi.waitFor(() => expect(busy("/prove-worker.js")).toBeDefined());
    const hung = busy("/prove-worker.js");
    vi.advanceTimersByTime(180_000);
    await expect(proof).rejects.toThrow("The prover stopped answering");
    expect(hung.terminated).toBe(true);

    const next = pool.runJob({ op: "prove", pczt: "" }, () => {});
    await vi.waitFor(() => expect(busy("/prove-worker.js")).not.toBe(hung));
    busy("/prove-worker.js").reply({
      ok: { txid: "ab", raw: new Uint8Array(), expiry_height: 1 },
    });
    expect(await next).toMatchObject({ txid: "ab" });
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
