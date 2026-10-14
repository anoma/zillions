import type { Color } from "./types";

/** Grey placeholder that fades on hover/focus, so empty inputs read as fields. */
export const placeholderClassName =
  "placeholder:text-current placeholder:opacity-30 placeholder:transition-opacity placeholder:duration-300 placeholder:ease-out-circ hover:placeholder:opacity-100 focus:placeholder:opacity-30";

/**
 * Resolve a design-token color name to a CSS custom property reference. The
 * tokens live in the Tailwind v4 `@theme` block (`theme.css`) as
 * `--color-<name>`, so e.g. "primary" -> "var(--color-primary)" (which resolves
 * to the ramp's DEFAULT). Replaces the old JS `colors` lookup.
 */
export const getDefaultColorString = (color: Color): string =>
  `var(--color-${color})`;
