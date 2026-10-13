import { expect, test, vi } from "vitest";

vi.mock("./crawl", () => ({}));
vi.mock("@zillions/zcore", () => ({}));

const { percentageOf } = await import("./sync");

test("progress counts each pool's chunks from its start, and nothing to read is done", () => {
  const last = { ironwood: 9, orchard: 19, sapling: -1 };
  expect(
    percentageOf(
      {
        ironwood: { start: 0, from: 0, to: 9 },
        // Nothing read yet.
        orchard: { start: 10, from: 20, to: 19 },
        sapling: { start: 0, from: 0, to: -1 },
      },
      last,
    ),
  ).toBe(50);
  expect(percentageOf({}, last)).toBe(100);
});
