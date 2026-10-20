import { expect, test } from "vitest";

import { capDecimals, transactionValue } from "./utils";

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
