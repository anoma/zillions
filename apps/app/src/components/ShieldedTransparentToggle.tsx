import type { KeyboardEvent } from "react";
import { twMerge } from "tailwind-merge";

const OPTIONS = [
  { isTransparent: false, label: "Shielded" },
  { isTransparent: true, label: "Transparent" },
];

/** Shielded/Transparent segmented control: a radio group with a sliding pill. */
export function ShieldedTransparentToggle({
  id,
  isTransparent,
  setIsTransparent,
  label,
}: {
  /** Given to the selected option, so a `<label>` can focus it. */
  id?: string;
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
      className="relative h-10 w-full p-1 grid grid-cols-2 rounded-full border border-line bg-card"
    >
      <span
        aria-hidden="true"
        className={twMerge(
          "absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full",
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
            id={selected ? id : undefined}
            // Keeps the option's own name; a <label> pointing here would replace it.
            aria-label={option.label}
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => setIsTransparent(option.isTransparent)}
            className={twMerge(
              "relative rounded-full text-sm font-medium transition-colors duration-300",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black",
              selected
                ? twMerge(
                    "cursor-default",
                    option.isTransparent && "text-white",
                  )
                : "cursor-pointer hover:bg-black/5",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
