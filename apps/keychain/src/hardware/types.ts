/**
 * The hardware-wallet abstraction. Every device (Ledger, Keystone, and
 * Trezor today) plugs in as one engine (background-safe logic) plus one set
 * of views (the interactive halves the setup wizard and the approval popup
 * render).
 *
 * The device's signing output crosses the IPC boundary only as an opaque
 * `deviceData` string; the device's own engine is what interprets it
 * (`assembleSignedPczt`), so adding a device never changes the contract.
 */
import type { ComponentType } from "react";

import type { DeviceCredential } from "../ipc/contract";

/** Which hardware wallet an account's keys live on. `passkey-prf`
 * differs from the hardware devices in custody only: its seed derives
 * from the credential's PRF at every ceremony — no secret at rest
 * anywhere. */
export type DeviceKind = "ledger" | "keystone" | "trezor" | "passkey-prf";

/** One step of a device interaction, as displayed. */
export type DeviceProgressStep = {
  /** Stable identifier (the device module's step machine value). */
  key: string;
  title: string;
  hint?: string;
};

/**
 * Everything the keychain stores for a hardware-wallet account. No
 * secrets — a `passkey-prf` account derives its seed at every ceremony,
 * and the hardware devices' keys never leave the device.
 */
export type DeviceKeys = {
  device: DeviceKind;
  /** Default account name: the device model, or what the device reports. */
  alias: string;
  /** Encoded UFVK (`uview1…`; a Trezor's transparent-only one is `uvf1…`). */
  viewingKey: string;
  /** ZIP-32 seed fingerprint (hex) the PCZT's zip32_derivation must carry. */
  seedFingerprint: string;
  /** ZIP-32 account index. */
  hdIndex: number;
  /**
   * The default addresses, as a Ledger reports them. A Keystone exports
   * nothing but keys: the keyring derives these from the viewing key.
   */
  transparentAddress?: string;
  shieldedAddress?: string;
  /**
   * A passkey account's WebAuthn credential: an at-rest pointer the
   * keychain stores as-is and only the passkey module interprets. No
   * secret — `publicKey` is the credential's COSE public key, and the
   * `passkey-prf` kind derives the account's keys from it at every
   * ceremony.
   */
  credential?: DeviceCredential;
};

/** At-rest device state the keyring passes to `assembleSignedPczt`:
 * material the engine needs to verify its own device's output. Devices
 * that verify against the transaction alone (Ledger, Keystone) need
 * nothing of it. */
export type DeviceSignContext = {
  credential?: DeviceCredential;
  /** The account's ZIP-32 index: the seed's account the engine signs with. */
  hdIndex?: number;
  /** The seed's fingerprint stored at setup, for a re-derived seed to match. */
  seedFingerprint?: string;
};

/** What the approval popup needs to drive signing on a device. */
export type DeviceSignTx = {
  device: DeviceKind;
  /** The unsigned PCZT, base64. */
  pczt: string;
  /** The signing account's ZIP-32 index. */
  hdIndex: number;
  /** A passkey account's credential id (base64url): the ceremony must use
   * this credential, not whichever passkey the user picks. */
  credentialId?: string;
};

/**
 * Background-safe half of a device: no transports, no React — importable from
 * the keyring.
 */
export interface DeviceEngine {
  kind: DeviceKind;
  /** Human name, e.g. "Ledger". */
  name: string;
  /** Whether this browser can reach the device at all. */
  isSupported(): boolean;
  /** Describe thrown Errors and device-SDK errors in user-facing words. */
  describeError(error: unknown): string;
  /**
   * Fold the device's opaque signing output (as produced by this device's
   * Sign view) into the keychain's unsigned PCZT, giving the complete signed
   * PCZT (base64). MUST verify the output against `unsignedPczt` and throw
   * otherwise — the keyring trusts nothing a page hands it. The keyring
   * passes `context`: the device's at-rest state (its credential and ZIP-32
   * index), so the engine never trusts it from a page.
   */
  assembleSignedPczt(
    unsignedPczt: string,
    deviceData: string,
    context?: DeviceSignContext
  ): Promise<string>;
}

/** Interactive half of a device, rendered by pages only. */
export type DeviceViews = {
  /** Read the account's keys off the device during setup. */
  Connect: ComponentType<{
    onKeys: (keys: DeviceKeys) => Promise<void> | void;
    onClose: () => void;
    /** Account names already in the Keychain, to suggest a free one. */
    takenAliases?: string[];
  }>;
  /**
   * Have the device sign `input`, then hand the opaque signing output to
   * `onResult` (which submits it). Awaited, so a failed submit re-arms the
   * view for a retry.
   */
  Sign: ComponentType<{
    input: DeviceSignTx;
    onResult: (deviceData: string) => Promise<void>;
    onCancel: () => void;
  }>;
};

/** A device, whole: what the keyring drives plus what the pages render. */
export type HardwareWallet = DeviceEngine & { views: DeviceViews };
