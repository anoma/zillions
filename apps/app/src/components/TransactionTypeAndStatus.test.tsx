// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  PendingStatus,
  TransactionTypeAndStatus,
} from "./TransactionTypeAndStatus";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const NOW = 1_800_000_000;

test("a broadcast counts down its usual wait, then is still processing", () => {
  vi.useFakeTimers({ now: NOW * 1000 });
  const { rerender } = render(
    <PendingStatus tx={{ tx_type: "Sent", timestamp: NOW - 60 }} />,
  );
  expect(screen.getByText("Processing · ~2 min")).toBeTruthy();

  rerender(
    <PendingStatus
      tx={{ tx_type: "Sent", timestamp: NOW - 10 * 60, expires_in: 8 }}
    />,
  );
  expect(screen.getByText("Still processing")).toBeTruthy();
  expect(screen.getByText(/next 8 blocks \(about 10 min\)/)).toBeTruthy();
});

test("a mined send confirms out of 3, a receive out of 10", () => {
  const { rerender } = render(
    <PendingStatus tx={{ tx_type: "Sent", confirmations: 1 }} />,
  );
  expect(screen.getByText("Confirming 1/3")).toBeTruthy();
  rerender(<PendingStatus tx={{ tx_type: "Received", confirmations: 4 }} />);
  expect(screen.getByText("Confirming 4/10")).toBeTruthy();
});

test("the detail page's title carries the status unless it's confirmed", () => {
  const { rerender, container } = render(
    <TransactionTypeAndStatus
      tx={{ tx_type: "Shielded", status: "Pending", confirmations: 2 }}
    />,
  );
  expect(container.textContent).toBe("Shielded (Confirming 2/3)");
  rerender(
    <TransactionTypeAndStatus tx={{ tx_type: "Sent", status: "Confirmed" }} />,
  );
  expect(container.textContent).toBe("Sent");
});
