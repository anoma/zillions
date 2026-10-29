/**
 * The Ledger engine: the background-safe half of the Ledger device module.
 * No transports and no React, so the keyring can import it; the transport
 * lives in `ledger-session.ts` and the screens in `ledger-views.tsx`.
 */
import type { LedgerSignatures } from "../ipc/contract";
import { applyLedgerSignatures } from "../background/crypto/zillions";
import type { DeviceEngine } from "./types";

// Chrome reports an unplugged Ledger and one whose access was revoked alike.
const MESSAGE_OF: Record<string, string> = {
  NoAccessibleDeviceError:
    "No Ledger found. Plug it in and unlock it. If it still isn't found, " +
    "connect it again from Add Keys → Connect to hardware wallet.",
};

/**
 * Describe thrown Errors and DMK errors, which are plain `{ _tag }` objects
 * carrying no message of their own, only the error that caused them.
 */
const ledgerErrorMessage = (e: unknown): string => {
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

/**
 * The device's Sign view encodes its signatures as JSON inside the opaque
 * `deviceData` string; this is the only place that decodes them.
 */
const decodeSignatures = (deviceData: string): LedgerSignatures => {
  let value: unknown;
  try {
    value = JSON.parse(deviceData);
  } catch {
    throw new Error("Unrecognized Ledger signing data");
  }
  const isHexArray = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((s) => typeof s === "string");
  if (
    typeof value !== "object" ||
    value === null ||
    !isHexArray((value as LedgerSignatures).orchard) ||
    !isHexArray((value as LedgerSignatures).ironwood) ||
    !isHexArray((value as LedgerSignatures).transparent)
  ) {
    throw new Error("Unrecognized Ledger signing data");
  }
  return value as LedgerSignatures;
};

export const ledgerEngine: DeviceEngine = {
  kind: "ledger",
  name: "Ledger",
  isSupported: () => "hid" in navigator,
  describeError: ledgerErrorMessage,
  /**
   * Put the device's signatures into the PCZT. `applyLedgerSignatures`
   * verifies every signature against the PCZT's own sighash and throws if
   * one doesn't sign it, so device (or page) tampering can't slip through.
   */
  assembleSignedPczt: async (unsignedPczt, deviceData) =>
    applyLedgerSignatures(unsignedPczt, decodeSignatures(deviceData)),
};
