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
