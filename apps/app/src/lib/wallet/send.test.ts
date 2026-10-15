import { beforeEach, expect, it, vi } from "vitest";
import type { SendPlan } from "./send";

vi.mock("./chain/indexer", () => ({
  CHUNK_SIZE: 1000,
  fetchTreeTip: vi.fn(),
  fetchTreeChunk: vi.fn(async () => new Uint8Array()),
}));

const { fetchTreeTip } = await import("./chain/indexer");
const tipOf = (size: number) => ({ size, body: new Uint8Array() });

/** A plan spending one Ironwood note at `position`. */
const planAt = (position: number) =>
  ({
    fee: 0,
    steps: [
      {
        notes: [{ pool: "ironwood", position }],
        inputs: [{ pool: "ironwood" }],
        payments: [],
        change: [],
      },
    ],
  }) as unknown as SendPlan;

const settle = () => new Promise((resolve) => setTimeout(resolve));

// The tip cache is module state: a fresh module per test.
let send: typeof import("./send");
beforeEach(async () => {
  vi.useRealTimers();
  vi.mocked(fetchTreeTip).mockReset();
  vi.resetModules();
  send = await import("./send");
  vi.spyOn(console, "log").mockImplementation(() => {});
});

it("reuses a prefetched tip until it's stale or short of the notes", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.mocked(fetchTreeTip).mockResolvedValue(tipOf(50));

  send.prefetchTrees(planAt(10));
  send.prefetchTrees(planAt(20));
  await settle();
  expect(fetchTreeTip).toHaveBeenCalledTimes(1);

  // A note past the cached tip needs a newer one.
  vi.mocked(fetchTreeTip).mockResolvedValue(tipOf(100));
  send.prefetchTrees(planAt(60));
  await settle();
  expect(fetchTreeTip).toHaveBeenCalledTimes(2);

  vi.advanceTimersByTime(5 * 60_000);
  send.prefetchTrees(planAt(60));
  await settle();
  expect(fetchTreeTip).toHaveBeenCalledTimes(3);
});

it("fetches again after a failed tip", async () => {
  vi.mocked(fetchTreeTip).mockRejectedValueOnce(new Error("504"));
  vi.mocked(fetchTreeTip).mockResolvedValue(tipOf(50));
  send.prefetchTrees(planAt(10));
  await settle();
  send.prefetchTrees(planAt(10));
  await settle();
  expect(fetchTreeTip).toHaveBeenCalledTimes(2);
});
