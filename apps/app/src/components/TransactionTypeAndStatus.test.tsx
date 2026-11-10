// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  PendingIcon,
  TransactionTypeAndStatus,
} from "./TransactionTypeAndStatus";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const NOW = 1_800_000_000;

test("a send's clock counts down its time left, then says it's late", () => {
  vi.useFakeTimers({ now: NOW * 1000 });
  const tx = { txid: "a", tx_type: "Sent" as const, timestamp: NOW - 60 };
  render(<PendingIcon tx={tx}>icon</PendingIcon>);
  // 60 s of the 90 planned.
  expect(screen.getByText("Processing · 30s left")).toBeTruthy();

  act(() => vi.advanceTimersByTime(60_000));
  expect(
    screen.getByText("Processing · Taking longer than usual"),
  ).toBeTruthy();
});

test("the receipt's title is the type alone, and says only when it expired", () => {
  const { rerender, container } = render(
    <TransactionTypeAndStatus
      tx={{ tx_type: "Shielded", status: "Pending" }}
    />,
  );
  expect(container.textContent).toBe("Shielded");
  rerender(
    <TransactionTypeAndStatus tx={{ tx_type: "Sent", status: "Expired" }} />,
  );
  expect(container.textContent).toBe("Sent (Expired)");
  rerender(
    <TransactionTypeAndStatus tx={{ tx_type: "Sent", status: "Confirmed" }} />,
  );
  expect(container.textContent).toBe("Sent");
});
