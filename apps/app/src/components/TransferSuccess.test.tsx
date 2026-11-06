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
const { TransferSuccess } = await import("./TransferSuccess");

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
  const { rerender } = render(<TransferSuccess tx={tx} />, {
    wrapper,
  });
  expect(screen.getByRole("status").textContent).toMatch(
    /^Transaction submittedProcessing · .+ left$/,
  );

  history = [{ txid: "t1", status: "Confirmed" }];
  rerender(<TransferSuccess tx={tx} />);
  expect(screen.getByRole("status").textContent).toBe("Transaction completed");
  // The receipt's icon drops its clock.
  expect(screen.queryByText(/^Processing ·/)).toBeNull();
});
