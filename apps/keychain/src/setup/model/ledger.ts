/**
 * Ledger connection: discover a device over WebHID, open a DMK session, build
 * the Zcash signer on it, check the app version, then read the account's
 * public keys or sign a PCZT. Each device action runs inside the DMK's
 * open-app flow, so it also walks the user through unlocking and opening the
 * Zcash app; `onStep` reports what the device waits on.
 */
import {
  DeviceActionStatus,
  DeviceManagementKitBuilder,
  DeviceModelId,
  LEDGER_VENDOR_ID,
  UserInteractionRequired,
  type DeviceActionIntermediateValue,
  type DeviceManagementKit,
  type DiscoveredDevice,
  type ExecuteDeviceActionReturnType,
} from "@ledgerhq/device-management-kit";
import {
  SignerZcashBuilder,
  type PcztTransaction,
  type SignerZcash,
} from "@ledgerhq/device-signer-kit-zcash";
import {
  webHidIdentifier,
  webHidTransportFactory,
} from "@ledgerhq/device-transport-kit-web-hid";

import type {
  Bip44Path,
  LedgerSignatures,
  Zip32Path,
} from "../../ipc/contract";
import { getNetwork } from "../../background/crypto/zillions";

export const LEDGER_BIP44_PATH: Bip44Path = { account: 0, change: 0, index: 0 };
export const LEDGER_ZIP32_PATH: Zip32Path = { account: 0 };

/** The first app-zcash that signs Ironwood spends with the right nullifier. */
export const MIN_ZCASH_APP_VERSION = "3.9.1";

/** What the device waits on, in the order a session meets them. */
export type LedgerStep =
  | "connect"
  | "unlock"
  | "open-app"
  | "confirm-key"
  | "sign";

/** Everything the keychain stores for a Ledger account; no secrets. */
export type LedgerKeys = {
  deviceName: string;
  transparentAddress: string;
  shieldedAddress: string;
  /** Encoded UFVK (`uview1…`). */
  viewingKey: string;
};

/** Whether this browser can reach a Ledger at all: WebHID, Chromium only. */
export const canUseHID = (): boolean => "hid" in navigator;

const MESSAGE_OF: Record<string, string> = {
  // Chrome reports an unplugged Ledger and one whose access was revoked alike.
  NoAccessibleDeviceError:
    "No Ledger found. Plug it in and unlock it. If it still isn't found, " +
    "connect it again from Add Keys → Connect to hardware wallet.",
};

/**
 * Describe thrown Errors and DMK errors, which are plain `{ _tag }` objects
 * carrying no message of their own, only the error that caused them.
 */
export const ledgerErrorMessage = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const { message, _tag, originalError } = e as {
      message?: string;
      _tag?: string;
      originalError?: unknown;
    };
    if (message) return message;
    if (_tag && MESSAGE_OF[_tag]) return MESSAGE_OF[_tag];
    if (_tag && originalError instanceof Error) {
      return `${_tag}: ${originalError.message}`;
    }
    if (_tag) return _tag;
  }
  return String(e);
};

export const isSupportedAppVersion = (version: string): boolean => {
  const [a, b, c] = version.split(".").map(Number);
  const [x, y, z] = MIN_ZCASH_APP_VERSION.split(".").map(Number);
  return a !== x ? a > x : b !== y ? b > y : c >= z;
};

const coinType = () => (getNetwork() === "main" ? 133 : 1);

const STEP_OF: Partial<Record<UserInteractionRequired, LedgerStep>> = {
  [UserInteractionRequired.UnlockDevice]: "unlock",
  [UserInteractionRequired.ConfirmOpenApp]: "open-app",
  [UserInteractionRequired.SignTransaction]: "sign",
};

/**
 * A Ledger the extension already has access to, else one the user picks in
 * the browser's device prompt. The approval window can't show that prompt,
 * so signing relies on the access granted when the Ledger was imported.
 */
const discoverDevice = async (dmk: DeviceManagementKit) => {
  const { hid } = navigator as Navigator & {
    hid: { getDevices(): Promise<{ vendorId: number }[]> };
  };
  const granted = (await hid.getDevices()).some(
    (d) => d.vendorId === LEDGER_VENDOR_ID,
  );
  return new Promise<DiscoveredDevice>((resolve, reject) => {
    if (granted) {
      // Starts empty, then lists the granted devices once the browser answers.
      const sub = dmk
        .listenToAvailableDevices({ transport: webHidIdentifier })
        .subscribe({
          next: ([device]) => {
            if (!device) return;
            queueMicrotask(() => sub.unsubscribe());
            resolve(device);
          },
          error: reject,
        });
      return;
    }
    const sub = dmk
      .startDiscovering({ transport: webHidIdentifier })
      .subscribe({
        next: (device) => {
          sub?.unsubscribe();
          void dmk.stopDiscovering();
          resolve(device);
        },
        error: reject,
      });
  });
};

const runAction = <
  Output,
  Error,
  Intermediate extends DeviceActionIntermediateValue,
>(
  { observable }: ExecuteDeviceActionReturnType<Output, Error, Intermediate>,
  onStep: (step: LedgerStep) => void,
) =>
  new Promise<Output>((resolve, reject) => {
    observable.subscribe({
      next: (state) => {
        switch (state.status) {
          case DeviceActionStatus.Pending: {
            const step =
              STEP_OF[
                state.intermediateValue
                  .requiredUserInteraction as UserInteractionRequired
              ];
            if (step) onStep(step);
            break;
          }
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
 * Run `use` on a connected Zcash app, closing the session after; rejects if
 * the app is older than `MIN_ZCASH_APP_VERSION` or `signal` aborts. Must be
 * called from a user gesture: WebHID only shows the device picker in
 * response to one.
 */
export const withLedger = async <T>(
  onStep: (step: LedgerStep) => void,
  use: (signer: SignerZcash, device: DiscoveredDevice) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> => {
  const dmk = new DeviceManagementKitBuilder()
    .addTransport(webHidTransportFactory)
    .build();
  const session = async () => {
    onStep("connect");
    const device = await discoverDevice(dmk);
    if (device.deviceModel.model === DeviceModelId.NANO_S) {
      throw new Error(
        "The Ledger Nano S can't run the Zcash app version Zillions needs. Use another Ledger model.",
      );
    }
    const sessionId = await dmk.connect({ device });
    const signer = new SignerZcashBuilder({ dmk, sessionId }).build();
    const { version } = await runAction(signer.getAppConfig(), onStep);
    if (!isSupportedAppVersion(version)) {
      throw new Error(
        `Update the Zcash app on your Ledger to ${MIN_ZCASH_APP_VERSION} or later (it has ${version}).`,
      );
    }
    return use(signer, device);
  };
  const aborted = new Promise<never>((_, reject) =>
    signal?.addEventListener("abort", () =>
      reject(new Error("Ledger request was cancelled")),
    ),
  );
  try {
    return await Promise.race([session(), aborted]);
  } finally {
    dmk.close();
  }
};

/** The account's addresses and UFVK; the user confirms the UFVK on the device. */
export const connectLedger = (
  onStep: (step: LedgerStep) => void,
  signal?: AbortSignal,
): Promise<LedgerKeys> =>
  withLedger(
    onStep,
    async (signer, device) => {
      const coin = coinType();
      const { account, change, index } = LEDGER_BIP44_PATH;
      const bip44 = `44'/${coin}'/${account}'/${change}/${index}`;
      const zip32 = `32'/${coin}'/${LEDGER_ZIP32_PATH.account}'`;

      const { address: transparentAddress } = await runAction(
        signer.getAddress(bip44),
        onStep,
      );
      const { address: shieldedAddress } = await runAction(
        signer.getShieldedAddress(bip44),
        onStep,
      );
      onStep("confirm-key");
      const fvk = await runAction(signer.getFullViewingKey(zip32), onStep);
      if (fvk.mode !== "ufvk") {
        throw new Error("Ledger returned an Orchard key instead of a UFVK");
      }

      return {
        deviceName: device.deviceModel.name,
        transparentAddress,
        shieldedAddress,
        viewingKey: fvk.fullViewingKey,
      };
    },
    signal,
  );

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** The device's signatures over `transaction`, as the keychain applies them. */
export const signLedgerPczt = async (
  signer: SignerZcash,
  transaction: PcztTransaction,
  onStep: (step: LedgerStep) => void,
): Promise<LedgerSignatures> => {
  onStep("sign");
  const signed = await runAction(
    signer.signPcztTransaction(transaction),
    onStep,
  );
  return {
    orchard: signed.orchard.map((s) => toHex(s.spendAuthSig)),
    ironwood: signed.ironwood.map((s) => toHex(s.spendAuthSig)),
    transparent: signed.transparentInputSigs.map(toHex),
  };
};
