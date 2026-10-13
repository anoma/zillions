import type { Keychain } from "./lib/keychain/keychain";

declare global {
  /** This app's version, from package.json at build time. */
  const __APP_VERSION__: string;
  /** Each pool's chunk where setup ends, looked up at build time (vite.config.ts). */
  const __SETUP_CHUNKS__: Record<"ironwood" | "orchard" | "sapling", number>;

  interface Window {
    zc?: Keychain;
  }
}
