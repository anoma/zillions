/**
 * The `passkey-prf` engine: the background-safe half of the deriving
 * passkey device module. A `passkey-prf` account has no secret at rest
 * anywhere: its seed is re-derived from the credential's PRF output at
 * each ceremony, and only public material (viewing key, addresses, seed
 * fingerprint, and the credential) is stored.
 *
 * Its views (`passkey-prf-views.tsx`) run the WebAuthn ceremonies in extension
 * pages — the extension claims the dedicated `keychain.zillions.money` RP via
 * the manifest's host permissions (see `passkey-constants.ts`), so the
 * browser's own passkey dialog is the transport and every assertion's origin
 * is this extension's own. The ceremony's output crosses the IPC boundary as
 * one opaque `deviceData` string (the JSON assertion plus PRF output) that
 * only this engine interprets: verify the assertion when the record holds
 * the credential's public key (accounts created here), re-derive the seed,
 * sign, zero-fill. An imported credential carries no public key — WebAuthn
 * never re-reveals one — so its spends are gated by the extension's own
 * review screen and the OS verification dialog instead of a verified
 * assertion.
 */
import { type AuthenticationResponseJSON } from "@simplewebauthn/server";

import { signPczt } from "../background/crypto/zillions";
import type { DeviceEngine, DeviceSignContext } from "./types";
import {
  b64,
  b64url,
  passkeyErrorMessage,
  passkeySupported,
  pcztChallenge,
  verifyAssertion,
  withPrfSeed,
} from "./passkey-core";

/** Fold a Sign view's `deviceData` (assertion + PRF output) into the
 * complete signed PCZT. The verifying public key comes from the STORED
 * credential — never from what the page handed over; an imported
 * account's record carries none, and its assertion goes unverified
 * (WebAuthn gives no key to check it with). */
const assemble = async (
  unsignedPczt: string,
  deviceData: string,
  context?: DeviceSignContext
): Promise<string> => {
  const credential = context?.credential;
  if (!credential) {
    throw new Error("The passkey's stored credential is missing");
  }
  if (typeof context?.hdIndex !== "number") {
    throw new Error("The passkey's account index is missing");
  }
  const hdIndex = context.hdIndex;
  const { assertion, prf } = JSON.parse(deviceData) as {
    assertion: AuthenticationResponseJSON;
    prf: string;
  };
  if (typeof prf !== "string") {
    throw new Error("The passkey's PRF output is missing");
  }
  if (credential.publicKey) {
    // Created here: the stored COSE key verifies the assertion — the
    // challenge binding, the origin, the RP and UV all checked
    // keyring-side, so a compromised page can't fabricate an approval.
    await verifyAssertion(
      assertion,
      await pcztChallenge(unsignedPczt),
      b64.decode(credential.publicKey)
    );
  }
  // Imported: WebAuthn never re-reveals an existing credential's public
  // key, so there is nothing to verify the assertion against — the
  // approval gate is the extension's own review screen and the OS
  // verification dialog. Strictly weaker than a created account (the
  // design doc records the asymmetry); a foreign PRF output still signs
  // nothing, as signatures under the wrong seed authorize none of this
  // account's spends.
  return withPrfSeed(b64url.decode(prf), async (seed) =>
    signPczt(unsignedPczt, seed, hdIndex)
  );
};

export const passkeyPrfEngine: DeviceEngine = {
  kind: "passkey-prf",
  name: "Passkey",
  isSupported: passkeySupported,
  describeError: passkeyErrorMessage,
  /**
   * Merge the passkey's signing output into the keychain's unsigned PCZT
   * after checking the assertion against it: the verifying key is the
   * stored credential's, the challenge is SHA-256 of `unsignedPczt`, and
   * UV is required — no other transaction can be approved by this
   * assertion, and no website can mint one. The PRF output then re-derives
   * the seed (same salt at every ceremony) inside `withPrfSeed`: the seed
   * and the decoded output are zero-filled the moment the signature
   * exists, on every exit.
   */
  assembleSignedPczt: (unsignedPczt, deviceData, context) =>
    assemble(unsignedPczt, deviceData, context),
};
