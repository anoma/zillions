import type { KeyboardEvent } from "react";
import { twMerge } from "tailwind-merge";

const OPTIONS = [
  { isTransparent: false, label: "Shielded" },
  { isTransparent: true, label: "Transparent" },
];

/** Shielded/Transparent segmented control: a radio group with a sliding pill. */
export function ShieldedTransparentToggle({
  isTransparent,
  setIsTransparent,
  label,
}: {
  isTransparent: boolean;
  setIsTransparent: (value: boolean) => void;
  label?: string;
}) {
  // Arrow keys move between the two options, as in any radio group.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      return;
    }
    e.preventDefault();
    const next = !isTransparent;
    setIsTransparent(next);
    e.currentTarget.querySelectorAll("button")[next ? 1 : 0]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="relative h-11 w-full p-0.5 grid grid-cols-2 rounded-full border border-line bg-surface"
    >
      <span
        aria-hidden="true"
        className={twMerge(
          "absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full",
          "transition-[translate,background-color] duration-300 ease-out",
          isTransparent ? "translate-x-full bg-black" : "bg-gold",
        )}
      />
      {OPTIONS.map((option) => {
        const selected = option.isTransparent === isTransparent;
        return (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => setIsTransparent(option.isTransparent)}
            className={twMerge(
              "relative rounded-full font-medium transition-colors duration-300",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black",
              selected
                ? twMerge(
                    "cursor-default",
                    option.isTransparent && "text-white",
                  )
                : "cursor-pointer text-black/60 hover:text-black hover:bg-black/5",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
