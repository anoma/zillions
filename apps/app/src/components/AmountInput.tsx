import type { ComponentProps } from "react";
import { twMerge } from "tailwind-merge";
import { fitFontSize } from "../lib/utils";
import { placeholderClassName } from "./ui/utils";

/** The big centered ZEC amount field; its font shrinks to fit the value. */
export function AmountInput({
  value,
  className,
  ...props
}: ComponentProps<"input"> & { value: string }) {
  return (
    <div className="@container">
      <input
        name="amount"
        type="text"
        placeholder="0"
        autoComplete="off"
        // Desktop only: on touch screens it would pop the keyboard over the form.
        autoFocus={matchMedia("(pointer: fine)").matches}
        className={twMerge(
          "h-30 w-full text-center leading-none font-medium outline-none",
          // Empty + focused: right-align so the caret sits after the "0"
          // (1ch is exactly its width) instead of cutting through it.
          "focus:placeholder-shown:text-right focus:placeholder-shown:pr-[calc(50%-0.5ch)]",
          placeholderClassName,
          className,
        )}
        style={{ fontSize: fitFontSize(value.length, "6rem") }}
        value={value}
        {...props}
      />
    </div>
  );
}
