// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { FeeRow } from "./PlannedFee";
import {
  AmountField,
  BalanceWithMax,
  SubmitBlock,
  SubmitProgress,
} from "./TransferForm";

vi.mock("../hooks/useConfirming", async (actual) => ({
  ...(await actual<typeof import("../hooks/useConfirming")>()),
  useReadyIn: () => 84_000,
}));
const { countdown } = await import("../hooks/usePendingProgress");

afterEach(cleanup);

window.matchMedia = (() => ({ matches: false })) as never;

test("an amount error is the field's description", () => {
  const onChange = vi.fn();
  render(
    <AmountField
      id="amount"
      value="1"
      onChange={onChange}
      error="Insufficient balance"
    />,
  );
  const input = screen.getByRole("textbox", { name: "Amount in ZEC" });
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(input.getAttribute("aria-describedby")).toBe("amount-error");
  expect(screen.getByRole("alert").textContent).toBe("Insufficient balance");
  fireEvent.change(input, { target: { value: "1.5" } });
  expect(onChange).toHaveBeenCalledWith("1.5");
});

test("Max shows the balance and toggles", () => {
  const onToggleMax = vi.fn();
  render(
    <BalanceWithMax
      balance={150_000_000n}
      waiting={0n}
      pool="shielded"
      isMax={true}
      onToggleMax={onToggleMax}
    />,
  );
  expect(screen.getByText(/Balance:/).textContent).toBe("Balance: 1.5 ZEC");
  const max = screen.getByRole("button", { name: "Max" });
  expect(max.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(max);
  expect(onToggleMax).toHaveBeenCalledOnce();
});

test("a submit waiting on confirming funds says why, counting down, then that it can go", () => {
  const hold = { held: () => true, reset: () => {} };
  const block = (notice: "waiting" | "ready") => (
    <SubmitBlock
      label="Send 1 ZEC"
      pending={false}
      pendingLabel="Sending..."
      stages={[]}
      confirming={{ ...hold, notice, waiting: 50_000_000n, verb: "send" }}
    />
  );
  const { rerender } = render(block("waiting"));
  const button = screen.getByRole("button", { name: "Send 1 ZEC" });
  // Never disabled: the notice is its description, announced as a status.
  expect(button.hasAttribute("disabled")).toBe(false);
  const notice = screen.getByRole("status");
  expect(button.getAttribute("aria-describedby")).toBe(notice.id);
  expect(notice.textContent).toBe(
    "0.5 ZEC of your balance is still processing. It'll be ready in 1m 24s.It'll be ready in about 2 min.",
  );

  rerender(block("ready"));
  expect(notice.textContent).toBe(
    "Your funds have confirmed. You can send now.",
  );
});

test("a countdown reads in seconds, then minutes and seconds", () => {
  expect(countdown(41_200)).toBe("42s");
  expect(countdown(65_000)).toBe("1m 05s");
  expect(countdown(0)).toBe("1s");
});

test("progress asks for approval, then says it's processing", () => {
  const { rerender } = render(
    <SubmitProgress stages={[{ stage: "building", at: 0, time: 0 }]} />,
  );
  const status = screen.getByRole("status");
  expect(status.textContent).toBe("Approve in your Keychain");
  rerender(<SubmitProgress stages={[{ stage: "approval", at: 0, time: 0 }]} />);
  expect(status.textContent).toBe("Approve in your Keychain");
  rerender(
    <SubmitProgress stages={[{ stage: "ironwood-proof", at: 0, time: 0 }]} />,
  );
  expect(status.textContent).toBe(
    "Processing your transactionKeep this page open until it's done.",
  );
});

test("a fee row shows the fee, a spinner while planning, or a dash", () => {
  const { rerender, container } = render(
    <FeeRow fee={15_000n} pending={false} />,
  );
  expect(container.textContent).toBe("Transaction fee0.00015 ZEC");
  rerender(<FeeRow pending={true} />);
  expect(container.querySelector("svg")).toBeTruthy();
  rerender(<FeeRow pending={false} />);
  expect(container.textContent).toBe("Transaction fee–");
});
