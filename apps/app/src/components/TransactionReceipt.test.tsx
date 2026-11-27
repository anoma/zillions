// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import type { Activity } from "../lib/wallet/types";

let history: Pick<Activity, "txid" | "status">[] = [];
vi.mock("../hooks/useGetTransactionHistory", () => ({
  useGetTransactionHistory: () => ({ data: history }),
}));
const { TransactionReceipt } = await import("./TransactionReceipt");

afterEach(cleanup);

const client = new QueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

test("the banner counts down until history has the transaction mined, then says it's completed", () => {
  const tx = {
    txid: "t1",
    tx_type: "Sent" as const,
    status: "Pending" as const,
    value: -1_000n,
    fee: 100n,
    timestamp: Math.floor(Date.now() / 1000),
    from: { pool: "shielded" as const },
    to: { address: "u1theirs" },
  };
  const { rerender } = render(<TransactionReceipt tx={tx} />, {
    wrapper,
  });
  expect(screen.getByRole("status").textContent).toMatch(
    /^Transaction submittedProcessing · .+ left$/,
  );

  history = [{ txid: "t1", status: "Confirmed" }];
  rerender(<TransactionReceipt tx={{ ...tx, status: "Confirmed" }} />);
  expect(screen.getByRole("status").textContent).toBe("Transaction completed");
});

test("a receipt opened once it's mined has no banner", () => {
  render(
    <TransactionReceipt
      tx={{
        txid: "t2",
        tx_type: "Sent",
        status: "Confirmed",
        value: -1_000n,
        fee: 100n,
        timestamp: 1,
        from: { pool: "shielded" },
        to: { address: "u1theirs" },
      }}
    />,
    { wrapper },
  );
  expect(screen.queryByRole("status")).toBeNull();
});

test("a payment link's receipt lists the claim fee apart from what the claimer receives", () => {
  render(
    <TransactionReceipt
      tx={{
        txid: "t3",
        tx_type: "Sent",
        link: true,
        status: "Confirmed",
        value: -20_000n,
        fee: 10_000n,
        timestamp: 1,
        from: { pool: "shielded" },
        to: { address: "u1link" },
      }}
    />,
    { wrapper },
  );
  const text = document.body.textContent;
  expect(text).toContain("Link amount0.0002");
  expect(text).toContain("Claim fee0.0001");
  expect(text).toContain("Transaction fee0.0001");
  expect(text).toContain("Total spent0.0004");
});
