import { expect, test, vi } from "vitest";

vi.mock("./crawl", () => ({}));
vi.mock("@zillions/zcore", () => ({}));

const { percentageOf } = await import("./sync");

test("progress counts each pool's chunks from its start, and nothing to read is done", () => {
  const last = { ironwood: 9, orchard: 19, sapling: -1 };
  expect(
    percentageOf(
      {
        ironwood: { start: 0, next: 10 },
        orchard: { start: 10, next: 10 },
        sapling: { start: 0, next: 0 },
      },
      last,
    ),
  ).toBe(50);
  expect(percentageOf({}, last)).toBe(100);
});
