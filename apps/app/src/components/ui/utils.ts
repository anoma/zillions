import { twMerge } from "tailwind-merge";
import type { Color } from "./types";

/**
 * Grey placeholder that darkens on hover, so empty inputs read as fields.
 * Browsers don't transition `::placeholder`, so the input's own color fades
 * while it's empty and the placeholder inherits it.
 */
export const placeholderClassName =
  "placeholder:text-current caret-black transition-colors duration-300 ease-out-circ placeholder-shown:text-black/35 placeholder-shown:hover:text-black/60 placeholder-shown:focus:text-black/35";

/**
 * Resolve a design-token color name to a CSS custom property reference. The
 * tokens live in the Tailwind v4 `@theme` block (`theme.css`) as
 * `--color-<name>`, so e.g. "primary" -> "var(--color-primary)" (which resolves
 * to the ramp's DEFAULT). Replaces the old JS `colors` lookup.
 */
export const getDefaultColorString = (color: Color): string =>
  `var(--color-${color})`;

export const focusRingClassName =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black";

/** A text input or textarea, in a card. */
export const inputClassName = twMerge(
  "w-full px-4 font-medium rounded-lg border border-line bg-card outline-none",
  "transition-colors duration-300 hover:border-line-strong focus:border-black",
  placeholderClassName,
);

/** A small pill button in a card, like "Max" or "Paste". */
export const pillButtonClassName = twMerge(
  "px-3 py-1 text-xs font-medium rounded-full border border-line-strong bg-card cursor-pointer",
  "transition-colors duration-300 hover:border-black/40 hover:bg-black/5",
  focusRingClassName,
);

/** Inline text that acts as a button, like "Add a message" or "Remove". */
export const textButtonClassName = twMerge(
  "rounded-sm cursor-pointer underline decoration-transparent underline-offset-4",
  "transition-colors duration-300 hover:decoration-current",
  focusRingClassName,
);

/** A form section's heading, and the flat card the section sits in. */
export const sectionLabelClassName = "text-sm font-medium text-gray-600";
export const cardClassName = twMerge(
  // Isolated so ActionButton's fill, painted at z-index -1, stays above the card.
  "isolate flex flex-col gap-4 p-6 rounded-3xl border border-line bg-card",
);
