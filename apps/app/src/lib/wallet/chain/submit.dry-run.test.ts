import { afterEach, expect, it, vi } from "vitest";

const proved = { txid: "ab", raw: "AQI=", expiryHeight: 9 };

vi.mock("./lightwalletd", () => ({ sendTransaction: vi.fn(async () => {}) }));

const { sendTransaction } = await import("./lightwalletd");

// The flag is read when the module loads: a fresh module per case.
async function broadcastWith(dryRun: string | undefined) {
  vi.stubEnv("VITE_DRY_RUN", dryRun);
  vi.resetModules();
  const { broadcastTransaction } = await import("./submit");
  return broadcastTransaction(proved);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(sendTransaction).mockClear();
});

it("never broadcasts on a dry run", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  await expect(broadcastWith("true")).rejects.toThrow("Dry run");
  expect(sendTransaction).not.toHaveBeenCalled();
  expect(console.log).toHaveBeenCalledWith(
    "[submit] dry run, not broadcast: txid ab, raw 0102",
  );
});

it("broadcasts without the flag", async () => {
  await expect(broadcastWith(undefined)).resolves.toMatchObject({
    txid: "ab",
  });
  expect(sendTransaction).toHaveBeenCalledWith(new Uint8Array([1, 2]));
});
