// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { FeeRow } from "./PlannedFee";
import { AmountField, AvailableWithMax, SubmitProgress } from "./TransferForm";

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

test("Max shows the available amount and toggles", () => {
  const onToggleMax = vi.fn();
  render(
    <AvailableWithMax
      available={150_000_000n}
      waiting={0n}
      pool="shielded"
      isMax={true}
      onToggleMax={onToggleMax}
    />,
  );
  expect(screen.getByText(/Available:/).textContent).toBe("Available: 1.5 ZEC");
  const max = screen.getByRole("button", { name: "Max" });
  expect(max.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(max);
  expect(onToggleMax).toHaveBeenCalledOnce();
});

test("progress lists only the optional steps that ran, up to the current one", () => {
  render(
    <SubmitProgress
      stages={[
        { stage: "approval", at: 0 },
        { stage: "ironwood-proof", at: 1 },
      ]}
    />,
  );
  const steps = screen.getAllByRole("listitem").map((li) => li.textContent);
  expect(steps).toEqual([
    "Approve in your keychain",
    expect.stringMatching(/^Generating the proof · Ironwood/),
    "Verifying",
    "Broadcasting",
  ]);
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
