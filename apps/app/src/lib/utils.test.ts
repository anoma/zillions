import { expect, test } from "vitest";

import { transactionValue } from "./utils";

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
