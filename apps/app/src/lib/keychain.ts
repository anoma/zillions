import type { ZillionsKeychain } from "../global";
import { invariant } from "./invariant";

export const KeychainEvent = {
  AccountChanged: "zc-account-changed",
  ConnectionRevoked: "zc-connection-revoked",
  Locked: "zc-extension-unlocked",
  Unlocked: "zc-extension-locked",
};

export function keychain(): ZillionsKeychain {
  invariant(window.zc, "Keychain not installed");
  return window.zc;
}
