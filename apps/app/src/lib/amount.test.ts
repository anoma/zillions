import { expect, test } from "vitest";

import {
  ceilingOf,
  ceilingProblem,
  isOverBalance,
  missingAmount,
  shownAmount,
} from "./amount";
import { capDecimals } from "./utils";

const CLAIM_FEE = 10_000n;

test("a pasted 28-decimal amount is cut to 8 and then says why it can't be sent", () => {
  const text = capDecimals("0.0000000000000000000000000001");
  expect(text).toBe("0.00000000");
  expect(missingAmount(text, false)).toBe(
    "The smallest amount is 0.00000001 ZEC",
  );
});

test("an empty or unreadable amount says so", () => {
  expect(missingAmount("", false)).toBe("Set an amount");
  expect(missingAmount("abc", false)).toBe("Not a valid amount");
  // Max with nothing to send has its own message from the ceiling.
  expect(missingAmount("5", true)).toBe("Set an amount");
});

test("Max draws its result once known, 0 included, and nothing while loading", () => {
  expect(shownAmount("", true, undefined)).toBe("");
  expect(shownAmount("", true, 0n)).toBe("0");
  expect(shownAmount("", true, 20_000n)).toBe("0.0002");
  expect(shownAmount("1.5", false, 20_000n)).toBe("1.5");
});

test("Max on a balance below the fee: nothing to send, and it says so", () => {
  // 0.000012 ZEC transparent can't pay a 10,000-zat fee: max_send returns 0.
  const ceiling = ceilingOf({
    most: 0n,
    wanted: 0n,
    short: false,
    max: true,
    extra: 0n,
  });
  expect(ceiling).toBe(0n);
  expect(ceilingProblem(ceiling!)).toBe("Not enough to pay the fee");
});

test("Max on a link: the claim fee can leave nothing even when the transaction fee fits", () => {
  // 0.0002 ZEC transparent, 0.00015 fee: the source can fund 5,000 zats,
  // less than the 10,000-zat claim fee.
  const ceiling = ceilingOf({
    most: 5_000n,
    wanted: 0n,
    short: false,
    max: true,
    extra: CLAIM_FEE,
  });
  expect(ceiling).toBe(0n);
  expect(ceilingProblem(ceiling!)).toBe("Not enough to pay the fee");
});

test("Max on a link with room for the claim fee sets no ceiling", () => {
  expect(
    ceilingOf({
      most: 30_000n,
      wanted: 0n,
      short: false,
      max: true,
      extra: CLAIM_FEE,
    }),
  ).toBeUndefined();
});

test("a typed link amount over the balance suggests what the link itself can hold", () => {
  // 0.0004 ZEC shielded, typed 0.0003: funding 0.0004 plus the fee fails,
  // and the most the source can fund is 0.0003, claim fee included.
  const ceiling = ceilingOf({
    most: 30_000n,
    wanted: 30_000n + CLAIM_FEE,
    short: true,
    max: false,
    extra: CLAIM_FEE,
  });
  expect(ceiling).toBe(20_000n);
  expect(ceilingProblem(ceiling!)).toBe(
    "Not enough to also pay the fee: you can send up to 0.0002 ZEC",
  );
});

test("a link amount equal to the balance gets the fee message, not insufficient balance", () => {
  // 0.0004 ZEC shielded, typed 0.0004: the claim fee is a fee, like the
  // transaction fee, so the amount itself fits and the ceiling explains.
  expect(isOverBalance(40_000n, 40_000n)).toBe(false);
  const ceiling = ceilingOf({
    most: 30_000n,
    wanted: 40_000n + CLAIM_FEE,
    short: true,
    max: false,
    extra: CLAIM_FEE,
  });
  expect(ceilingProblem(ceiling!)).toBe(
    "Not enough to also pay the fee: you can send up to 0.0002 ZEC",
  );
  expect(isOverBalance(40_001n, 40_000n)).toBe(true);
});

test("a typed amount over the balance suggests the most it can send", () => {
  const ceiling = ceilingOf({
    most: 30_000n,
    wanted: 40_000n,
    short: true,
    max: false,
    extra: 0n,
  });
  expect(ceiling).toBe(30_000n);
  expect(ceilingProblem(ceiling!)).toBe(
    "Not enough to also pay the fee: you can send up to 0.0003 ZEC",
  );
});

test("a typed amount that failed for another reason sets no ceiling", () => {
  // Under the most it can fund, so the failure isn't the balance (e.g. #93).
  expect(
    ceilingOf({
      most: 30_000n,
      wanted: 20_000n,
      short: true,
      max: false,
      extra: 0n,
    }),
  ).toBeUndefined();
});
