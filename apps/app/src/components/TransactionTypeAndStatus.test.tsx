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

test("a send's clock shows its percent and time left, then only why it's late", () => {
  vi.useFakeTimers({ now: NOW * 1000 });
  const tx = { txid: "a", tx_type: "Sent" as const, timestamp: NOW - 60 };
  render(<PendingIcon tx={{ ...tx, expires_in: 8 }}>icon</PendingIcon>);
  // 60 s of the 240 planned.
  expect(screen.getByText("Processing · 25%")).toBeTruthy();
  expect(screen.getByText("About 3 min left")).toBeTruthy();

  act(() => vi.advanceTimersByTime(4 * 60_000));
  expect(screen.getByText("Processing")).toBeTruthy();
  expect(screen.getByText(/next 8 blocks \(about 10 min\)/)).toBeTruthy();
});

test("a mined receive is planned over the 9 blocks it still needs", () => {
  vi.useFakeTimers({ now: NOW * 1000 });
  render(
    <PendingIcon
      tx={{ txid: "b", tx_type: "Received", timestamp: NOW, confirmations: 1 }}
    >
      icon
    </PendingIcon>,
  );
  expect(screen.getByText("Processing · 0%")).toBeTruthy();
  expect(screen.getByText("About 12 min left")).toBeTruthy();
});

test("the detail page's title says Processing until it's confirmed", () => {
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
  expect(container.textContent).toMatch(/Shielded \(Processing\)$/);
  rerender(
    <TransactionTypeAndStatus
      tx={{ txid: "c", tx_type: "Sent", status: "Confirmed" }}
    />,
  );
  expect(container.textContent).toBe("Sent");
});
