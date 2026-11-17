/**
 * The Trezor engine: the background-safe half of the Trezor device module.
 * No transports and no React, so the keyring can import it; the transport
 * lives in `trezor-session.ts` and the screens in `trezor-views.tsx`.
 */
import { applyDeviceSignatures, type LedgerSignatures } from "../background/crypto/zillions";
import type { DeviceEngine } from "./types";

// Connect's TypedErrors say what went wrong, in its own words.
const MESSAGE_OF: Record<string, string> = {
  Device_NotFound:
    "No Trezor found. Connect it again from Add Keys → Connect to hardware " +
    "wallet. If two Trezors are connected, unplug the one you don't need — " +
    "the Keychain can't choose between them.",
  Transport_Missing:
    "The Trezor transport didn't start. Reload this tab and try again.",
  Method_Interrupted: "Trezor request was cancelled",
  Method_Cancel: "Trezor request was cancelled",
};

/** Describe thrown Errors and connect's TypedErrors (`{ code, message }`). */
const trezorErrorMessage = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const { code, message, error } = e as {
      code?: string;
      message?: string;
      error?: string;
    };
    if (code && MESSAGE_OF[code]) return MESSAGE_OF[code];
    if (message) return message;
    if (error) return error;
    if (code) return code;
  }
  return String(e);
};

/**
 * The device's Sign view encodes its signatures as JSON inside the opaque
 * `deviceData` string; this is the only place that decodes them. A Trezor
 * signs transparent inputs only, so that one list is all it carries.
 */
const decodeSignatures = (deviceData: string): LedgerSignatures => {
  let value: unknown;
  try {
    value = JSON.parse(deviceData);
  } catch {
    throw new Error("Unrecognized Trezor signing data");
  }
  const isHexArray = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((s) => typeof s === "string");
  if (
    typeof value !== "object" ||
    value === null ||
    !isHexArray((value as LedgerSignatures).transparent)
  ) {
    throw new Error("Unrecognized Trezor signing data");
  }
  return {
    orchard: [],
    ironwood: [],
    transparent: (value as LedgerSignatures).transparent,
  };
};

export const trezorEngine: DeviceEngine = {
  kind: "trezor",
  name: "Trezor",
  isSupported: () => "usb" in navigator,
  describeError: trezorErrorMessage,
  /**
   * Put the device's signatures into the PCZT. `applyDeviceSignatures`
   * verifies every signature against the PCZT's own sighash and throws if
   * one doesn't sign it, so device (or page) tampering can't slip through.
   */
  assembleSignedPczt: async (unsignedPczt, deviceData) =>
    applyDeviceSignatures(unsignedPczt, decodeSignatures(deviceData)),
};
