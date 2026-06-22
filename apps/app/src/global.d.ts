import type { Keychain } from "./lib/keychain/keychain";

declare global {
  interface Window {
    zc?: Keychain;
  }
}
