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

/** A form section's heading, and the flat card the section sits in. */
export const sectionLabelClassName = "text-sm font-semibold";
export const cardClassName = twMerge(
  "flex flex-col gap-3 p-5 rounded-3xl border border-line bg-card",
  "transition-colors duration-300 focus-within:border-line-strong",
);
