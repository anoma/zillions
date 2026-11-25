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

// The first that shares only the connected account: `account()`, `switchAccount()`.
export const MIN_KEYCHAIN_VERSION = "0.15.0";

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

/** Locked, for this site; an older Keychain can't say, so false. */
export async function isKeychainLocked(): Promise<boolean> {
  const zc: Partial<Keychain> = keychain();
  return (await zc.isLocked?.()) ?? false;
}

/** The Keychain refused a read because it is locked, whatever its version. */
export const isLockedError = (err: unknown): boolean =>
  String(err).includes("Keychain is locked");

/** A locked Keychain refuses every retry too: show the unlock screen at once. */
export const retryUnlessLocked = (failures: number, err: Error): boolean =>
  failures < 3 && !isLockedError(err);

export function waitForKeychainInjection(): Promise<Keychain | undefined> {
  return waitForWindowProp("zc");
}
