import { expect, test } from "vitest";

import { postcard } from "./chunks";

test("a varint reads across continuation bytes", () => {
  const read = postcard(Uint8Array.of(0xf4, 0x03, 7));
  expect(read.varint()).toBe(500);
  expect(read.varint()).toBe(7);
});

test("a body cut off inside a varint throws instead of looping", () => {
  const read = postcard(Uint8Array.of(0x05, 0x80));
  expect(read.varint()).toBe(5);
  expect(() => read.varint()).toThrow("Truncated postcard varint");
});
