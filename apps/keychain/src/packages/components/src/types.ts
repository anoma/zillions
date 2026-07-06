// Design-token color names, matching the `--color-<name>` custom properties in
// the Tailwind v4 `@theme` block (`theme.css`). Used for component color props,
// which resolve to `var(--color-<name>)` (see `getDefaultColorString`).

/** Ramp families that define numbered steps (`--color-<ramp>-<step>`). */
type ColorRamp = "primary" | "cyan" | "pink" | "neutral";

/** Standard ramp steps defined for every `ColorRamp` in `theme.css`. */
type ColorStep =
  | 50
  | 100
  | 200
  | 300
  | 400
  | 500
  | 600
  | 700
  | 800
  | 900
  | 950;

export type Color =
  | "success"
  | "intermediate"
  | "orange"
  | "fail"
  | "white"
  | "black"
  | "gray"
  | "rblack"
  | "upcoming"
  | "transparent"
  | "yay"
  | "nay"
  | "abstain"
  | "primary"
  | "cyan"
  | "pink"
  | "neutral"
  // Numbered ramp steps, e.g. `neutral-400`, `primary-600`. Resolve to
  // `var(--color-<ramp>-<step>)`, all defined in `theme.css`.
  | `${ColorRamp}-${ColorStep}`;
