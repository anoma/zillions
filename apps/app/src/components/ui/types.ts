// Design-token color names: `gold`/`surface` are custom colors defined in this
// project's `@theme` block (`index.css`); the numbered ramps (e.g. `neutral-500`)
// come from Tailwind v4's built-in default theme. Used for component color props,
// which resolve to `var(--color-<name>)` (see `getDefaultColorString`).

import type colors from "tailwindcss/colors";

/** Custom colors defined in this project's `@theme` block (`index.css`). */
type AppColor = "gold" | "gold-button" | "on-gold" | "surface";

/** Tailwind's built-in single-value color keywords (no numbered steps). */
type FlatColor = "inherit" | "current" | "transparent" | "black" | "white";

/** Ramp family names, e.g. `neutral`, `slate` (from Tailwind's default theme). */
type RampFamily = keyof Omit<typeof colors, FlatColor | AppColor>;

/** Numbered shade steps available on every ramp family. */
type RampStep = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;

/** A ramp family + step, e.g. `neutral-500`. Resolves to `var(--color-neutral-500)`. */
type RampColor = `${RampFamily}-${RampStep}`;

export type Color = AppColor | FlatColor | RampColor;
