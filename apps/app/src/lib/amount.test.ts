import { expect, test } from "vitest";

import {
  ceilingOf,
  ceilingProblem,
  isOverBalance,
  missingAmount,
  planRecipient,
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

test("a fake address never reaches the planner, so it can't pass for a fee problem", () => {
  const plan = (to: string, valid: boolean, isMax: boolean) =>
    planRecipient({ to, valid, isMax, isPaymentLink: false, standIn: "u1me" });
  // Max with "aaaa" plans against our own address.
  expect(plan("aaaa", false, true)).toBe("u1me");
  expect(plan("", false, true)).toBe("u1me");
  // A typed amount waits for a valid recipient.
  expect(plan("aaaa", false, false)).toBe("");
  expect(plan("t1abc", true, false)).toBe("t1abc");
  expect(plan("t1abc", true, true)).toBe("t1abc");
  expect(
    planRecipient({
      to: "aaaa",
      valid: false,
      isMax: false,
      isPaymentLink: true,
      standIn: "u1me",
    }),
  ).toBe("u1me");
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
  // 0.0002 ZEC with a 0.00015 fee funds 5,000 zats, under the claim fee.
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
  // Typed 0.0003 of 0.0004: the source funds at most 0.0003, claim fee included.
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
  // Typed 0.0004 of 0.0004: only the fees go over, so the ceiling explains.
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
