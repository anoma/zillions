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

test("the detail page's title is the type alone, the clock on its icon says it's processing", () => {
  const { rerender, container } = render(
    <TransactionTypeAndStatus
      tx={{
        txid: "c",
        tx_type: "Shielded",
        status: "Pending",
        confirmations: 2,
      }}
    />,
  );
  // The tooltip, then the title.
  expect(container.textContent).toMatch(/^Processing · .+Shielded$/);
  rerender(
    <TransactionTypeAndStatus
      tx={{ txid: "c", tx_type: "Sent", status: "Confirmed" }}
    />,
  );
  expect(container.textContent).toBe("Sent");
});
