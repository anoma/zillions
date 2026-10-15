import { afterEach, expect, it, vi } from "vitest";

const proved = { txid: "ab", raw: new Uint8Array([1, 2]), expiry_height: 9 };

/** A prove worker that warms up and proves anything at once. */
class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror = null;
  postMessage(msg: object) {
    const data = "warm" in msg ? { warmed: 0 } : { ok: proved };
    queueMicrotask(() => this.onmessage?.({ data }));
  }
  terminate() {}
}

vi.mock("./prove.ts?worker", () => ({ default: FakeWorker }));
vi.mock("@zillions/zcore", () => ({
  default: vi.fn(async () => {}),
  needs_sapling_params: vi.fn(() => false),
}));
vi.mock("./lightwalletd", () => ({ sendTransaction: vi.fn(async () => {}) }));

const { sendTransaction } = await import("./lightwalletd");

// The flag is read when the module loads: a fresh module per case.
async function submitWith(dryRun: string | undefined) {
  vi.stubEnv("VITE_DRY_RUN", dryRun);
  vi.resetModules();
  const { submitTransaction } = await import("./submit");
  return submitTransaction(new Uint8Array([7]));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(sendTransaction).mockClear();
});

it("proves but never broadcasts on a dry run", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  await expect(submitWith("true")).rejects.toThrow("Dry run");
  expect(sendTransaction).not.toHaveBeenCalled();
  expect(console.log).toHaveBeenCalledWith(
    "[submit] dry run, not broadcast: txid ab, raw 0102",
  );
});

it("broadcasts without the flag", async () => {
  await expect(submitWith(undefined)).resolves.toMatchObject({ txid: "ab" });
  expect(sendTransaction).toHaveBeenCalledWith(proved.raw);
});
