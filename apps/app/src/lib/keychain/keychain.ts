import { invariant } from "../invariant";
import { Events, type ZCashKeychainAccount, type Zillions } from "./types/src";
import { waitForWindowProp } from "./utils";

export type KeychainAccount = ZCashKeychainAccount;
export type Keychain = Zillions;

export const KeychainEvent = Events;

export function keychain(): Keychain {
  invariant(window.zc, "Keychain not installed");
  return window.zc;
}

export function isKeychainAvailable(): boolean {
  return Boolean(window.zc);
}

export function waitForKeychainInjection(): Promise<Keychain | undefined> {
  return waitForWindowProp("zc");
}
