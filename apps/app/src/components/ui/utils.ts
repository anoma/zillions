import type { Color } from "./types";

/**
 * Resolve a design-token color name to a CSS custom property reference. The
 * tokens live in the Tailwind v4 `@theme` block (`theme.css`) as
 * `--color-<name>`, so e.g. "primary" -> "var(--color-primary)" (which resolves
 * to the ramp's DEFAULT). Replaces the old JS `colors` lookup.
 */
export const getDefaultColorString = (color: Color): string =>
  `var(--color-${color})`;
