/**
 * The device engines, keyed by kind. Background-safe: importable from the
 * keyring without bundling React or device transports into the service
 * worker. Pages use the full `wallets` registry from `./index` instead.
 */
import type { DeviceEngine, DeviceKind } from "./types";
import { keystoneEngine } from "./keystone";
import { ledgerEngine } from "./ledger";
import { passkeyPrfEngine } from "./passkey-prf";
import { trezorEngine } from "./trezor";

export const engines: Record<DeviceKind, DeviceEngine> = {
  keystone: keystoneEngine,
  ledger: ledgerEngine,
  "passkey-prf": passkeyPrfEngine,
  trezor: trezorEngine,
};
