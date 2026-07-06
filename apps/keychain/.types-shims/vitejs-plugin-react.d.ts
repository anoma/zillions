// Minimal type stub for `@vitejs/plugin-react`.
//
// The real `@vitejs/plugin-react@6` ships a `.d.ts` that uses a string-named
// re-export (`export { ... as "module.exports" }`) which the repo's pinned
// TypeScript 5.5.4 cannot parse. tsc only encounters these types transitively
// via `@wxt-dev/module-react`'s `Options` import; the plugin itself is consumed
// by WXT at build time as JS, never type-checked against our code. This stub
// satisfies the type import without parsing the broken upstream declaration.
import type { Plugin } from "vite";

export interface Options {
  [key: string]: unknown;
}

declare function viteReact(options?: Options): Plugin[];
export default viteReact;
