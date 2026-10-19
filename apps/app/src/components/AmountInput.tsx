import type { ComponentProps } from "react";
import { twMerge } from "tailwind-merge";
import { fitFontSize, zatoshiToZec } from "../lib/utils";
import { placeholderClassName } from "./ui/utils";

/** "ZEC" after a hero amount, sized relative to it. */
export function AmountUnit() {
  return <span className="ml-[0.4em] text-[0.4em] text-gray-600">ZEC</span>;
}

/**
 * The big ZEC amount field with its unit beside it; the font shrinks to fit
 * the value. The field is as wide as the number, so the unit follows it.
 */
export function AmountInput({
  value,
  className,
  maxFontSize = "6rem",
  ...props
}: ComponentProps<"input"> & { value: string; maxFontSize?: string }) {
  return (
    <div
      className={twMerge(
        "@container flex items-center justify-center",
        className,
      )}
    >
      {/* Chrome won't set an input's line-height below normal; the sizer and
          unit match it so all three share a baseline. */}
      <div
        className="flex items-baseline leading-[normal] font-medium"
        // +2 leaves room for the unit.
        style={{ fontSize: fitFontSize(value.length + 2, maxFontSize) }}
      >
        <span className="grid">
          {/* Sizes the cell to the number, plus the input's placeholder padding; the input fills it. */}
          <span
            aria-hidden="true"
            className={twMerge(
              "col-start-1 row-start-1 invisible whitespace-pre",
              !value && "pl-[0.06em]",
            )}
          >
            {value || "0"}
          </span>
          <input
            name="amount"
            type="text"
            inputMode="decimal"
            aria-label="Amount in ZEC"
            placeholder="0"
            autoComplete="off"
            // Desktop only: on touch screens it would pop the keyboard over the form.
            autoFocus={matchMedia("(pointer: fine)").matches}
            className={twMerge(
              // Zero intrinsic width, so the sizer alone sets the cell's width.
              "col-start-1 row-start-1 w-0 min-w-full bg-transparent outline-none",
              // A hair of padding keeps the caret off the placeholder's edge.
              "placeholder-shown:pl-[0.06em]",
              placeholderClassName,
            )}
            value={value}
            {...props}
          />
        </span>
        <AmountUnit />
      </div>
    </div>
  );
}

/** A fixed hero amount, drawn like `AmountInput`. */
export function AmountDisplay({
  zat,
  className,
}: {
  zat: bigint;
  className?: string;
}) {
  const zec = zatoshiToZec(zat);
  return (
    <div
      className={twMerge(
        "@container h-20 flex items-center justify-center",
        className,
      )}
    >
      <span
        className="flex items-baseline leading-none font-medium tabular-nums"
        style={{ fontSize: fitFontSize(zec.length + 2, "4.5rem") }}
      >
        {zec}
        <AmountUnit />
      </span>
    </div>
  );
}
