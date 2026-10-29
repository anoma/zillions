/**
 * Hardware wallets, whole (engine + views), keyed by kind. Pages-only: the
 * views pull in React and device transports, which must never reach the
 * background service worker — background code imports `engines` instead.
 */
import type { DeviceKind, HardwareWallet } from "./types";
import { engines } from "./engines";
import { ledgerViews } from "./ledger-views";

export * from "./types";
export { engines } from "./engines";

export const wallets: Record<DeviceKind, HardwareWallet> = {
  ledger: { ...engines.ledger, views: ledgerViews },
};
