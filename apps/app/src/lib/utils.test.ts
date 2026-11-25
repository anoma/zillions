import { expect, test } from "vitest";

import {
  atomicToWhole,
  capDecimals,
  singleton,
  transactionValue,
  wholeToAtomic,
  wholeToScaledBigInt,
} from "./utils";

test("a typed amount keeps at most 8 decimals", () => {
  expect(capDecimals("0.0000000000000000000000000001")).toBe("0.00000000");
  expect(capDecimals("1.123456789")).toBe("1.12345678");
  expect(capDecimals("0.00000001")).toBe("0.00000001");
  expect(capDecimals("12.")).toBe("12.");
});

test("an amount is signed by who it's with, never by the fee", () => {
  const sign = (tx: Parameters<typeof transactionValue>[0]) =>
    transactionValue(tx).signal;

  expect(sign({ tx_type: "Received", value: 10_000n, fee: 0n })).toBe("+");
  expect(sign({ tx_type: "Sent", value: -10_000n, fee: 10_000n })).toBe("−");
  // Paying itself less than the fee still moves none of its funds away.
  expect(
    sign({ tx_type: "Sent", value: -1_000n, fee: 10_000n, self: true }),
  ).toBe("");
  for (const tx_type of ["Shielded", "Unshielded", "Migrated"] as const) {
    expect(sign({ tx_type, value: 10_000n, fee: 15_000n })).toBe("");
  }
});

test("a singleton runs once on success, and again after a failure", async () => {
  let calls = 0;
  const once = singleton(async () => {
    calls++;
    if (calls === 1) throw new Error("locked");
    return calls;
  });
  await expect(once()).rejects.toThrow("locked");
  expect(await once()).toBe(2);
  expect(await once()).toBe(2);
  expect(calls).toBe(2);
});

test("whole and atomic amounts convert at any token's decimals", () => {
  expect(atomicToWhole(1_234_567n, 6)).toBe("1.234567");
  expect(atomicToWhole(1_000_000n, 6)).toBe("1");
  expect(atomicToWhole(-5n, 2)).toBe("-0.05");
  expect(wholeToAtomic("1.234567", 6)).toBe(1_234_567n);
  expect(wholeToAtomic("12", 6)).toBe(12_000_000n);
  expect(wholeToAtomic(0.5, 2)).toBe(50n);
  // A number too small for plain `toString` is still written out in full.
  expect(wholeToAtomic(1e-7, 8)).toBe(10n);
  expect(() => wholeToAtomic("0.123", 2)).toThrow("at most 2");
  for (const text of ["", ".", "-", "abc", "1e5", "1.2.3"]) {
    expect(() => wholeToAtomic(text, 8)).toThrow("Invalid amount");
  }
});

test("a price becomes an exact integer and its scale", () => {
  expect(wholeToScaledBigInt(73978)).toEqual([73978n, 0]);
  expect(wholeToScaledBigInt(1315.9)).toEqual([13159n, 1]);
  expect(wholeToScaledBigInt("0.0001")).toEqual([1n, 4]);
  expect(wholeToScaledBigInt("-2.50")).toEqual([-250n, 2]);
});
