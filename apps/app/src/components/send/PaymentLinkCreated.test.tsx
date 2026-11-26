// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { Activity } from "../../lib/wallet/types";
import { PaymentLinkCreated } from "./PaymentLinkCreated";

let history: Partial<Activity>[] = [];
vi.mock("../../hooks/useGetTransactionHistory", () => ({
  useGetTransactionHistory: () => ({ data: history }),
}));
vi.mock("../../hooks/usePendingProgress", () => ({
  usePendingProgress: () => ({ percent: 40, detail: "2m 40s left" }),
}));

let blocker: { status: string; reset?: () => void; proceed?: () => void } = {
  status: "idle",
};
let blocks: (() => boolean) | undefined;
vi.mock("@tanstack/react-router", async (actual) => ({
  ...(await actual<object>()),
  useBlocker: ({ shouldBlockFn }: { shouldBlockFn: () => boolean }) => {
    blocks = shouldBlockFn;
    return blocker;
  },
}));

afterEach(() => {
  cleanup();
  blocker = { status: "idle" };
});

const url = "https://zillions.money/claim#v=1&k=secret";
const renderLink = (props: Partial<Parameters<typeof PaymentLinkCreated>[0]>) =>
  render(
    <PaymentLinkCreated
      url={url}
      amount={1_000n}
      description="Lunch"
      {...props}
    />,
  );
const leaveWarned = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

test("the link shows while its funding is still being sent, and leaving asks first", () => {
  history = [];
  renderLink({});
  expect(screen.getByText("Copy link")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain(
    "Keep this page open",
  );
  expect(leaveWarned()).toBe(true);
});

test("once broadcast, the link shows its funding confirming and leaving is free", () => {
  history = [{ txid: "aa", status: "Pending" }];
  renderLink({ tx: { txid: "aa", tx_type: "Sent" } });
  expect(screen.getByText("Copy link")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("2m 40s left");
  expect(leaveWarned()).toBe(false);
});

test("a confirmed funding shows the link ready", () => {
  history = [{ txid: "aa", status: "Confirmed" }];
  renderLink({ tx: { txid: "aa", tx_type: "Sent" } });
  expect(screen.getByText("Payment link ready")).toBeTruthy();
  expect(screen.getByText("Copy link")).toBeTruthy();
});

test("a failed or expired funding hides the link", () => {
  history = [{ txid: "aa", status: "Expired" }];
  renderLink({ tx: { txid: "aa", tx_type: "Sent" } });
  expect(screen.getByText("Link not created")).toBeTruthy();
  expect(document.body.innerHTML).not.toContain("secret");
  cleanup();

  history = [];
  renderLink({ error: new Error("Proof failed") });
  expect(screen.getByText("Proof failed")).toBeTruthy();
  expect(document.body.innerHTML).not.toContain("secret");
  expect(leaveWarned()).toBe(false);
});

test("navigating away before the broadcast explains the proof and lets the user stay", () => {
  history = [];
  const reset = vi.fn();
  blocker = { status: "blocked", reset, proceed: vi.fn() };
  renderLink({});
  expect(blocks?.()).toBe(true);
  const dialog = screen.getByRole("alertdialog");
  expect(dialog.textContent).toContain("making the proof");
  screen.getByText("Stay").click();
  expect(reset).toHaveBeenCalled();
});

test("once broadcast, navigating away isn't blocked", () => {
  history = [{ txid: "aa", status: "Pending" }];
  renderLink({ tx: { txid: "aa", tx_type: "Sent" } });
  expect(blocks?.()).toBe(false);
  expect(screen.queryByRole("alertdialog")).toBeNull();
});
