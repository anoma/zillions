import {
  Events,
  type ZCashKeychainAccount,
  type Zillions,
} from "@zillions/keychain-types";
import { invariant } from "../invariant";
import { compareVersions, waitForWindowProp } from "./utils";

export type KeychainAccount = ZCashKeychainAccount;
export type Keychain = Zillions;

export const KeychainEvent = Events;

// The first that keeps the viewing key: decrypts, builds and proves for the app.
export const MIN_KEYCHAIN_VERSION = "0.14.0";

export function keychain(): Keychain {
  invariant(window.zc, "Keychain not installed");
  return window.zc;
}

export function isKeychainAvailable(): boolean {
  return Boolean(window.zc);
}

export function isKeychainVersionSupported(): boolean {
  const version = keychain().version();
  if (!version) return false;
  return compareVersions(version, MIN_KEYCHAIN_VERSION) >= 0;
}

export function waitForKeychainInjection(): Promise<Keychain | undefined> {
  return waitForWindowProp("zc");
}
