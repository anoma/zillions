/**
 * Ledger connection: discover a device over WebHID, open a DMK session, build
 * the Zcash signer on it and read the account's public keys. Each device
 * action runs inside the DMK's open-app flow, so it also walks the user
 * through unlocking and opening the Zcash app, reporting each required
 * interaction via `onInteraction`.
 */
import {
  DeviceActionStatus,
  DeviceManagementKitBuilder,
  UserInteractionRequired,
  type DeviceActionIntermediateValue,
  type DeviceManagementKit,
  type DiscoveredDevice,
  type ExecuteDeviceActionReturnType,
} from "@ledgerhq/device-management-kit";
import { SignerZcashBuilder } from "@ledgerhq/device-signer-kit-zcash";
import {
  webHidIdentifier,
  webHidTransportFactory,
} from "@ledgerhq/device-transport-kit-web-hid";

import type { Bip44Path, Zip32Path } from "../../ipc/contract";

export { UserInteractionRequired };

// SLIP-44 coin type for Zcash mainnet; the Ledger Zcash app derives under it.
const ZCASH_COIN_TYPE = 133;

export const LEDGER_BIP44_PATH: Bip44Path = { account: 0, change: 0, index: 0 };
export const LEDGER_ZIP32_PATH: Zip32Path = { account: 0 };

/** Everything the keychain stores for a Ledger account; no secrets. */
export type LedgerKeys = {
  deviceName: string;
  transparentAddress: string;
  shieldedAddress: string;
  /** Encoded UFVK (`uview1…`). */
  viewingKey: string;
};

/** Describe DMK errors (plain `{ _tag, message }` objects) and thrown Errors. */
export const ledgerErrorMessage = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const { message, _tag } = e as { message?: string; _tag?: string };
    if (message || _tag) return message || _tag!;
  }
  return String(e);
};

const discoverDevice = (dmk: DeviceManagementKit) =>
  new Promise<DiscoveredDevice>((resolve, reject) => {
    const sub = dmk.startDiscovering({ transport: webHidIdentifier }).subscribe({
      next: (device) => {
        sub?.unsubscribe();
        void dmk.stopDiscovering();
        resolve(device);
      },
      error: reject,
    });
  });

const runAction = <Output, Error, Intermediate extends DeviceActionIntermediateValue>(
  { observable }: ExecuteDeviceActionReturnType<Output, Error, Intermediate>,
  onInteraction: (interaction: UserInteractionRequired) => void
) =>
  new Promise<Output>((resolve, reject) => {
    observable.subscribe({
      next: (state) => {
        switch (state.status) {
          case DeviceActionStatus.Pending:
            onInteraction(
              state.intermediateValue
                .requiredUserInteraction as UserInteractionRequired
            );
            break;
          case DeviceActionStatus.Completed:
            resolve(state.output);
            break;
          case DeviceActionStatus.Error:
            reject(state.error);
            break;
          case DeviceActionStatus.Stopped:
            reject(new Error("Ledger request was cancelled"));
            break;
        }
      },
      error: reject,
    });
  });

/**
 * Must be called from a user gesture: WebHID only shows the device picker in
 * response to one. The session is closed before returning.
 */
export const connectLedger = async (
  onInteraction: (interaction: UserInteractionRequired) => void
): Promise<LedgerKeys> => {
  const dmk = new DeviceManagementKitBuilder()
    .addTransport(webHidTransportFactory)
    .build();
  try {
    const device = await discoverDevice(dmk);
    const sessionId = await dmk.connect({ device });
    const signer = new SignerZcashBuilder({ dmk, sessionId }).build();

    const { account, change, index } = LEDGER_BIP44_PATH;
    const bip44 = `44'/${ZCASH_COIN_TYPE}'/${account}'/${change}/${index}`;
    const zip32 = `32'/${ZCASH_COIN_TYPE}'/${LEDGER_ZIP32_PATH.account}'`;

    const { address: transparentAddress } = await runAction(
      signer.getAddress(bip44),
      onInteraction
    );
    const { address: shieldedAddress } = await runAction(
      signer.getShieldedAddress(bip44),
      onInteraction
    );
    const fvk = await runAction(signer.getFullViewingKey(zip32), onInteraction);
    if (fvk.mode !== "ufvk") {
      throw new Error("Ledger returned an Orchard key instead of a UFVK");
    }

    return {
      deviceName: device.deviceModel.name,
      transparentAddress,
      shieldedAddress,
      viewingKey: fvk.fullViewingKey,
    };
  } finally {
    dmk.close();
  }
};
