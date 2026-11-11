// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { Activity } from "../../lib/wallet/types";
import { PaymentLinkCreated } from "./PaymentLinkCreated";

let history: Partial<Activity>[] = [];
vi.mock("../../hooks/useGetTransactionHistory", () => ({
  useGetTransactionHistory: () => ({ data: { activities: history } }),
}));
vi.mock("../../hooks/usePendingProgress", () => ({
  usePendingProgress: () => ({ percent: 40, detail: "2m 40s left" }),
}));

afterEach(cleanup);

const url = "https://zillions.money/claim#v=1&k=secret";
const renderLink = () =>
  render(
    <PaymentLinkCreated
      tx={{ txid: "aa", tx_type: "Sent" }}
      url={url}
      amount={1_000n}
      description="Lunch"
    />,
  );

test("the link stays hidden while its funding is pending", () => {
  history = [{ txid: "aa", status: "Pending" }];
  renderLink();
  expect(screen.getByText("Creating payment link")).toBeTruthy();
  expect(screen.getByText("2m 40s left")).toBeTruthy();
  expect(screen.queryByText("Copy link")).toBeNull();
  expect(document.body.innerHTML).not.toContain("secret");
});

test("a confirmed funding shows the link", () => {
  history = [{ txid: "aa", status: "Confirmed" }];
  renderLink();
  expect(screen.getByText("Payment link ready")).toBeTruthy();
  expect(screen.getByText("Copy link")).toBeTruthy();
});

test("an expired funding never shows the link", () => {
  history = [{ txid: "aa", status: "Expired" }];
  renderLink();
  expect(screen.getByText("Link not created")).toBeTruthy();
  expect(document.body.innerHTML).not.toContain("secret");
});
