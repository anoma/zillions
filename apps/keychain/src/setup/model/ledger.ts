/**
 * Ledger connection: discover a device over WebHID, open a DMK session and
 * build the Zcash signer on it. `getAppConfig` runs inside the DMK's open-app
 * action, so it also walks the user through unlocking and opening the Zcash
 * app, reporting each required interaction via `onInteraction`.
 */
import {
  DeviceActionStatus,
  DeviceManagementKitBuilder,
  UserInteractionRequired,
  type DeviceManagementKit,
  type DeviceSessionId,
  type DiscoveredDevice,
} from "@ledgerhq/device-management-kit";
import {
  SignerZcashBuilder,
  type SignerZcash,
} from "@ledgerhq/device-signer-kit-zcash";
import {
  webHidIdentifier,
  webHidTransportFactory,
} from "@ledgerhq/device-transport-kit-web-hid";

export { UserInteractionRequired };

export type LedgerConnection = {
  dmk: DeviceManagementKit;
  sessionId: DeviceSessionId;
  signer: SignerZcash;
  deviceName: string;
  appVersion: string;
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

const readAppVersion = (
  signer: SignerZcash,
  onInteraction: (interaction: UserInteractionRequired) => void
) =>
  new Promise<string>((resolve, reject) => {
    signer.getAppConfig().observable.subscribe({
      next: (state) => {
        switch (state.status) {
          case DeviceActionStatus.Pending:
            onInteraction(state.intermediateValue.requiredUserInteraction);
            break;
          case DeviceActionStatus.Completed:
            resolve(state.output.version);
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
 * response to one.
 */
export const connectLedger = async (
  onInteraction: (interaction: UserInteractionRequired) => void
): Promise<LedgerConnection> => {
  const dmk = new DeviceManagementKitBuilder()
    .addTransport(webHidTransportFactory)
    .build();
  try {
    const device = await discoverDevice(dmk);
    const sessionId = await dmk.connect({ device });
    const signer = new SignerZcashBuilder({ dmk, sessionId }).build();
    const appVersion = await readAppVersion(signer, onInteraction);
    return {
      dmk,
      sessionId,
      signer,
      deviceName: device.deviceModel.name,
      appVersion,
    };
  } catch (e) {
    dmk.close();
    throw e;
  }
};
