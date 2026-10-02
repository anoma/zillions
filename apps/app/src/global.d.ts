import type { Keychain } from "./lib/keychain/keychain";

declare global {
  /** This app's version, from package.json at build time. */
  const __APP_VERSION__: string;

  interface Window {
    zc?: Keychain;
  }
}
