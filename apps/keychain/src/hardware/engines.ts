/**
 * The device engines, keyed by kind. Background-safe: importable from the
 * keyring without bundling React or device transports into the service
 * worker. Pages use the full `wallets` registry from `./index` instead.
 */
import type { DeviceEngine, DeviceKind } from "./types";
import { ledgerEngine } from "./ledger";

export const engines: Record<DeviceKind, DeviceEngine> = {
  ledger: ledgerEngine,
};
