import { afterEach, expect, it, vi } from "vitest";

// Past one 32 KiB piece, with every byte value.
const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => (i * 7919) % 256);
const encoded = Buffer.from(bytes).toString("base64");

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

it("round-trips without the browser's codec", async () => {
  expect("fromBase64" in Uint8Array).toBe(false);
  const { base64ToBytes, bytesToBase64 } = await import("./base64");
  expect(bytesToBase64(bytes)).toBe(encoded);
  expect(base64ToBytes(encoded)).toEqual(bytes);
  expect(base64ToBytes("")).toEqual(new Uint8Array());
});

it("uses the browser's codec where it has one", async () => {
  const fromBase64 = vi.fn(() => bytes);
  const toBase64 = vi.fn(() => encoded);
  Object.assign(Uint8Array, { fromBase64 });
  Object.assign(Uint8Array.prototype, { toBase64 });
  try {
    const { base64ToBytes, bytesToBase64 } = await import("./base64");
    expect(base64ToBytes(encoded)).toBe(bytes);
    expect(bytesToBase64(bytes)).toBe(encoded);
    expect(fromBase64).toHaveBeenCalledWith(encoded);
    expect(toBase64).toHaveBeenCalledOnce();
  } finally {
    delete (Uint8Array as { fromBase64?: unknown }).fromBase64;
    delete (Uint8Array.prototype as { toBase64?: unknown }).toBase64;
  }
});
