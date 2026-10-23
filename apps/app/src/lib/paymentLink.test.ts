import { expect, test } from "vitest";

import { MEMO_BYTES } from "./memo";
import { DESCRIPTION_BYTES, linkMemo, linkUrl, parseLink } from "./paymentLink";

const nk = "ab".repeat(32);
const sealed = new Uint8Array(32).fill(0xcd);

test("the memo is the header, then the description", () => {
  const memo = linkMemo(nk, sealed, "Lunch");
  expect(memo.slice(0, 18)).toBe("ff5041594c494e4b01");
  expect(memo.slice(18, 82)).toBe(nk);
  expect(memo.slice(82, 146)).toBe("cd".repeat(32));
  expect(memo.slice(146)).toBe("4c756e6368");
});

test("the longest description fills the memo exactly", () => {
  const memo = linkMemo(nk, sealed, "a".repeat(DESCRIPTION_BYTES));
  expect(memo.length / 2).toBe(MEMO_BYTES);
  expect(() =>
    linkMemo(nk, sealed, "a".repeat(DESCRIPTION_BYTES + 1)),
  ).toThrow();
});

test("the link keeps everything in its fragment", () => {
  const url = linkUrl({
    base: "https://zillions.money/",
    key: new Uint8Array(32).fill(0xff),
    amount: 150_000_000n,
    treeSize: 81_920,
    network: "main",
    description: "Lunch & coffee",
  });
  const { origin, pathname, search, hash } = new URL(url);
  expect([origin, pathname, search]).toEqual([
    "https://zillions.money",
    "/claim",
    "",
  ]);
  const fields = new URLSearchParams(hash.slice(1));
  expect(fields.get("v")).toBe("1");
  expect(fields.get("k")).toBe("_".repeat(42) + "8");
  expect(fields.get("a")).toBe("1.5");
  expect(fields.get("s")).toBe("81920");
  expect(fields.get("n")).toBe("main");
  expect(fields.get("d")).toBe("Lunch & coffee");
});

test("a link without a description has no d", () => {
  const url = linkUrl({
    base: "https://zillions.money/",
    key: new Uint8Array(32),
    amount: 1n,
    treeSize: 0,
    network: "test",
    description: "",
  });
  expect(new URLSearchParams(new URL(url).hash.slice(1)).has("d")).toBe(false);
});

test("a link reads back as it was made", () => {
  const key = Uint8Array.from({ length: 32 }, (_, i) => i * 7);
  const url = linkUrl({
    base: "https://zillions.money/",
    key,
    amount: 150_000_000n,
    treeSize: 81_920,
    network: "main",
    description: "Lunch & coffee",
  });
  expect(parseLink(new URL(url).hash)).toEqual({
    key,
    amount: 150_000_000n,
    treeSize: 81_920,
    network: "main",
    description: "Lunch & coffee",
  });
});

test("reads a link the app made", () => {
  const link = parseLink(
    "#v=1&k=GZiAff9TvbWF5B_CJVkWE9ypZd93lrvVte-EnRAfFjY&a=0.00001&s=836343&n=main",
  );
  expect(link?.key.length).toBe(32);
  expect(link?.amount).toBe(1_000n);
  expect(link?.treeSize).toBe(836_343);
  expect(link?.description).toBe("");
});

test("anything else isn't a link", () => {
  for (const fragment of [
    "",
    "#v=2&k=AA&a=1&s=0&n=main",
    "#v=1&k=AAAA&a=1&s=0&n=main",
    "#v=1&k=GZiAff9TvbWF5B_CJVkWE9ypZd93lrvVte-EnRAfFjY&a=1&s=x&n=main",
    "#v=1&k=***&a=1&s=0&n=main",
  ]) {
    expect(parseLink(fragment)).toBeUndefined();
  }
});
