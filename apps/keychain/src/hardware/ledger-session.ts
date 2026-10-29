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

import type { Bip44Path, Zip32Path } from "../ipc/contract";
import {
  getNetwork,
  type LedgerSignatures,
} from "../background/crypto/zillions";
import type { DeviceKeys } from "./types";

/** One step of a device interaction, as displayed. */
export type DeviceProgressStep = {
  /** Stable identifier (the device module's step machine value). */
  key: string;
  title: string;
  hint?: string;
};

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

/** The steps' display copy, for the progress UI. */
export const LEDGER_STEPS: Record<LedgerStep, DeviceProgressStep> = {
  connect: {
    key: "connect",
    title: "Connect your Ledger",
    hint: "Plug it in and choose it in the browser prompt.",
  },
  unlock: { key: "unlock", title: "Unlock it with your PIN" },
  "open-app": { key: "open-app", title: "Open the Zcash app" },
  "confirm-key": {
    key: "confirm-key",
    title: "Approve the viewing key",
    hint: "It lets Zillions find your funds. It can't spend them.",
  },
  sign: { key: "sign", title: "Review and approve the transaction" },
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
 * Run `run` on a connected Zcash app, closing the session after; rejects if
 * the app is older than `MIN_ZCASH_APP_VERSION` or `signal` aborts. Must be
 * called from a user gesture: WebHID only shows the device picker in
 * response to one.
 */
export const withLedger = async <T>(
  onStep: (step: LedgerStep) => void,
  run: (signer: SignerZcash, device: DiscoveredDevice) => Promise<T>,
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
    return run(signer, device);
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
): Promise<DeviceKeys> =>
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
        device: "ledger",
        alias: device.deviceModel.name,
        transparentAddress,
        shieldedAddress,
        viewingKey: fvk.fullViewingKey,
        // The device never reveals its seed's fingerprint. The app's PCZT
        // needs 32 bytes and the device doesn't check them: zeros, the
        // signer kit's default.
        seedFingerprint: "00".repeat(32),
        hdIndex: LEDGER_ZIP32_PATH.account,
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
