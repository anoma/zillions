/**
 * The Keystone engine: the background-safe half of the Keystone device
 * module. The device has no transport — its screens (`keystone-views.tsx`)
 * animate the PCZT out as QRs for the device to scan, then scan the signed
 * PCZT back — and the signing output leaves for the background as an opaque
 * base64 `deviceData` string, which only this engine interprets.
 */
import { combinePczts } from "../background/crypto/zillions";
import type { DeviceEngine } from "./types";

const keystoneErrorMessage = (e: unknown): string => {
  const message = e instanceof Error ? e.message : String(e);
  // `combine_pczts` refuses PCZTs whose shared fields disagree.
  if (message.includes("DataMismatch")) {
    return (
      "The Keystone's response doesn't match the transaction the keychain " +
      "asked it to sign. Cancel and start the signing over."
    );
  }
  return message;
};

export const keystoneEngine: DeviceEngine = {
  kind: "keystone",
  name: "Keystone",
  // Everything runs over the camera: no WebHID, so no Chromium-only posture.
  isSupported: () => typeof navigator.mediaDevices?.getUserMedia === "function",
  describeError: keystoneErrorMessage,
  /**
   * Merge the device's scanned PCZT into the keychain's copy. The combiner
   * compares every global, input and output field pairwise and refuses
   * conflicting values, so a response for any other transaction is refused;
   * the proof keys the device strips come from the keychain's copy. The
   * signatures themselves are verified against the combined transaction
   * when the app extracts it.
   */
  assembleSignedPczt: (unsignedPczt, deviceData) =>
    combinePczts(unsignedPczt, deviceData),
};
