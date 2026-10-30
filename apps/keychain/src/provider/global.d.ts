/**
 * Ambient type for `window.zc`, set by `injected.ts`.
 *
 * Kept in its own `.d.ts` rather than in `injected.ts` itself: `.d.ts` files
 * matched by tsconfig's `include` are added to the program directly, rather
 * than reached via import from other files. `injected.ts` is imported from
 * both `entrypoints/injected.ts` and here indirectly, and having the
 * `declare global` live in a regularly-imported `.ts` file caused it to be
 * processed under more than one resolution path, which `tsc` reported as
 * `zc` colliding with itself (TS2300) and `Window.zc` narrowing to `(a: any)
 * => void` instead of `InjectedZillions` (TS2322).
 */
import type { InjectedZillions } from "./InjectedZillions";

declare global {
  // NOTE: var is required to extend globalThis
  var zc: InjectedZillions;
}
