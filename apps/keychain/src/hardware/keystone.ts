/**
 * The Keystone engine: the background-safe half of the Keystone device
 * module. The device has no transport — its screens (`keystone-views.tsx`)
 * animate the PCZT out as QRs for the device to scan, then scan the signed
 * PCZT back — and the signing output leaves for the background as an opaque
 * base64 `deviceData` string, which only this engine interprets.
 */
import { combinePczts, keystoneFwVersion } from "../background/crypto/zillions";
import type { DeviceEngine } from "./types";

/**
 * `[major, minor, build]` raw, 3.0.8: the first release that stamps its
 * firmware version into signed responses (and signs Ironwood). Devices too
 * old to stamp can't prove what they run.
 */
const MIN_FW = [13, 0, 8];

const olderThan = (version: string, min: number[]): boolean => {
  const at = version.split(".").map(Number);
  for (let i = 0; i < min.length; i++) {
    if ((at[i] ?? 0) !== min[i]) return (at[i] ?? 0) < min[i];
  }
  return false;
};

const tooOldError = (version?: string): Error => {
  // The device displays its raw major minus 10 ("13.0.8" shows as "3.0.8").
  const [major = 0, minor = 0, build = 0] = (version ?? "")
    .split(".")
    .map(Number);
  const display = version && `${major - 10}.${minor}.${build}`;
  return new Error(
    display
      ? `This Keystone runs firmware ${display}. Update it to 3.0.8 or ` +
        "later and sign again."
      : "This Keystone doesn't report its firmware version. Update it to " +
        "3.0.8 or later and sign again."
  );
};

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
   * Merge the device's scanned PCZT into the keychain's copy, after
   * checking the firmware stamp it carries: too-old firmware signs no
   * Ironwood transaction. The combiner compares every global, input and
   * output field pairwise and refuses conflicting values, so a response
   * for any other transaction is refused; the proof keys the device strips
   * come from the keychain's copy. The signatures themselves are verified
   * against the combined transaction when the app extracts it.
   */
  assembleSignedPczt: async (unsignedPczt, deviceData) => {
    const version = await keystoneFwVersion(deviceData);
    if (version === undefined || olderThan(version, MIN_FW)) {
      throw tooOldError(version);
    }
    return combinePczts(unsignedPczt, deviceData);
  },
};
