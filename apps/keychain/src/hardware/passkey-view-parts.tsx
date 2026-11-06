/**
 * The passkey screens' shared parts: the ceremonies and stages the passkey
 * kind's views are built from (`passkey-prf-views.tsx`). Everything here
 * runs in an extension page — the extension claims the dedicated
 * `keychain.zillions.money` RP through the manifest's host permissions
 * (see `passkey-constants.ts`), so the browser's own passkey dialog is the
 * transport and every assertion's origin is this extension's own.
 */
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { ComponentType, ReactNode } from "react";
import { useState } from "react";

import { ActionButton, Alert, Stack } from "@zillions/components";

import {
  PRF_SALT,
  RP_ID,
  RP_NAME,
  b64url,
  extensionOrigins,
  passkeyErrorMessage,
  pcztChallenge,
  prfBytes,
  verifyAssertion,
  PrfMissingError,
} from "./passkey-core";
import type { DeviceSignTx } from "./types";

export const cancelProps = (onClose: () => void) => ({
  size: "lg" as const,
  outlineColor: "black" as const,
  backgroundHoverColor: "black" as const,
  textHoverColor: "primary" as const,
  onClick: onClose,
});

const randomChallenge = (): string =>
  b64url.encode(crypto.getRandomValues(new Uint8Array(32)));

/** A credential a create ceremony just produced and verified. */
export type CreatedCredential = {
  id: string;
  publicKey: Uint8Array<ArrayBuffer>;
};

/**
 * Whether this page can verify Ed25519 assertions later: WebCrypto gained
 * Ed25519 only recently (Chromium ~137, Firefox later), and the page that
 * creates the credential is the one that verifies its spends — offering
 * the algorithm without this guard would mint credentials nothing in
 * this browser could verify. The result is cached: the answer can't
 * change mid-session.
 */
let ed25519Verifiable: boolean | undefined;
const canVerifyEd25519 = async (): Promise<boolean> => {
  if (ed25519Verifiable === undefined) {
    try {
      await crypto.subtle.generateKey("Ed25519", false, ["sign", "verify"]);
      ed25519Verifiable = true;
    } catch {
      // The algorithm is absent from WebCrypto (or unusable here), so an
      // Ed25519 credential could never be verified in this browser.
      ed25519Verifiable = false;
    }
  }
  return ed25519Verifiable;
};

/**
 * The create ceremony: a new credential for the dedicated RP, its
 * registration verified against our own origins before anything is
 * stored. The PRF extension is requested with the salt evaluated inline —
 * providers that evaluate at create (all synced providers, modern
 * platforms) return the output here, collapsing the connect to one
 * ceremony; the probe handles the rest (CTAP2.0-era keys, get-only
 * providers) via `prfFromRegistration`'s verdict.
 */
export const createCredential = async (): Promise<{
  reg: Awaited<ReturnType<typeof startRegistration>>;
  credential: CreatedCredential;
  /** The PRF output, when the provider evaluated the salt at create. */
  prf?: Uint8Array<ArrayBuffer>;
}> => {
  const challenge = randomChallenge();
  // Ordered strength-then-reach, and authenticators pick the first
  // algorithm they support: ES256 first (the only StrongBox-backed
  // algorithm on Android TEE providers), RS256 as the universal
  // fallback, Ed25519 last — it's TEE-only where offered at all, so
  // no StrongBox device should ever fall through to it.
  const pubKeyCredParams: PublicKeyCredentialParameters[] = [
    { alg: -7, type: "public-key" }, // ES256
    { alg: -257, type: "public-key" }, // RS256
  ];
  if (await canVerifyEd25519()) {
    pubKeyCredParams.push({ alg: -8, type: "public-key" }); // Ed25519
  }
  const reg = await startRegistration({
    optionsJSON: {
      challenge,
      rp: { id: RP_ID, name: RP_NAME },
      user: {
        id: randomChallenge(),
        name: "Zillions account",
        displayName: "Zillions account",
      },
      pubKeyCredParams,
      authenticatorSelection: {
        // Not "required": discoverability buys nothing here — every
        // later ceremony addresses the credential via allowCredentials —
        // and CTAP2.0-era keys can't store resident credentials, so a
        // requirement would bounce them from the dialog entirely
        // ("your device can't be used with this site"). Capable
        // providers still create discoverable passkeys on their own.
        residentKey: "preferred",
        userVerification: "required",
      },
      extensions: {
        prf: {
          // Evaluate the salt at create: the output (when the provider
          // returns one) makes this the connect's only ceremony.
          eval: { first: PRF_SALT },
        },
      },
      attestation: "none",
    },
  });
  // Attestation "none" carries nothing more to prove; the response is
  // still verified against our own origins and RP, and hands over the
  // credential's COSE public key to store.
  const registration = await verifyRegistrationResponse({
    response: reg,
    expectedChallenge: challenge,
    expectedOrigin: await extensionOrigins(),
    expectedRPID: RP_ID,
    requireUserVerification: true,
  });
  if (!registration.verified || !registration.registrationInfo) {
    throw new Error("The passkey creation failed verification");
  }
  const credential = registration.registrationInfo.credential;
  return { reg, credential, prf: prfFromRegistration(reg) };
};

/**
 * The PRF output a create ceremony may have carried: providers that
 * evaluate at create return it in the registration's client extension
 * results. `enabled === false` is a definitive refusal — fail fast and
 * skip the probe, which could only end in `PrfMissingError`; an output
 * is the entropy; neither means the provider was silent at create, so
 * the probe decides.
 */
export const prfFromRegistration = (
  reg: Awaited<ReturnType<typeof startRegistration>>
): Uint8Array<ArrayBuffer> | undefined => {
  const prf = reg.clientExtensionResults?.prf;
  if (prf?.enabled === false) throw new PrfMissingError();
  const first = prf?.results?.first;
  return first ? prfBytes(first) : undefined;
};

/**
 * The PRF probe: a get() ceremony evaluating the fixed salt for the new
 * credential. The fallback to create-time eval — CTAP2.0-era keys and
 * get-only providers answer here but stay silent at create (some skip
 * the `prf.enabled` flag too — the evaluation, not the flag, decides).
 * Both extension request forms go out, the same salt either way: some
 * providers only process one of them. Returns the PRF output (raw
 * bytes, normalized); `PrfMissingError` when the provider won't
 * evaluate one.
 */
export const probePrf = async (
  reg: Awaited<ReturnType<typeof startRegistration>>,
  credentialPublicKey: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> => {
  const probeChallenge = randomChallenge();
  const assertion = await startAuthentication({
    optionsJSON: {
      challenge: probeChallenge,
      rpId: RP_ID,
      allowCredentials: [{ id: reg.id, type: "public-key" }],
      userVerification: "required",
      extensions: {
        prf: {
          // `eval` is the WebAuthn L3 shape every modern platform
          // implements; `evalByCredential` the CTAP2.1+ per-credential
          // shape security keys want. With one allowed credential both
          // resolve to the same salt — sending both covers the most
          // providers.
          eval: { first: PRF_SALT },
          evalByCredential: {
            [reg.id]: { first: PRF_SALT },
          },
        },
      },
    },
  });
  const prf = assertion.clientExtensionResults?.prf?.results?.first;
  if (!prf) throw new PrfMissingError();
  await verifyAssertion(assertion, probeChallenge, credentialPublicKey);
  return prfBytes(prf);
};

/**
 * The import ceremony: a get() with no allowCredentials, so the browser's
 * picker lists every synced passkey for the RP and the user picks the one
 * whose account to recover. The salt is the same fixed one; the `eval`
 * request form only — `evalByCredential` names credential ids, which
 * discovery can't know. Nothing is verified here: an authentication
 * response never carries the credential's public key (only a create
 * response does), so an imported account's record holds the credential's
 * id and RP alone, and its spends are gated by the extension's own
 * review screen and the OS verification dialog instead of a verified
 * assertion (the design doc records the asymmetry).
 */
export const importCredential = async (): Promise<{
  assertion: Awaited<ReturnType<typeof startAuthentication>>;
  prf: Uint8Array<ArrayBuffer>;
}> => {
  const challenge = randomChallenge();
  const assertion = await startAuthentication({
    optionsJSON: {
      challenge,
      rpId: RP_ID,
      userVerification: "required",
      extensions: {
        prf: {
          eval: { first: PRF_SALT },
        },
      },
    },
  });
  const out = assertion.clientExtensionResults?.prf?.results?.first;
  if (!out) throw new PrfMissingError();
  return { assertion, prf: prfBytes(out) };
};

type SignProps = {
  input: DeviceSignTx;
  onResult: (deviceData: string) => Promise<void>;
  onCancel: () => void;
};

/** The spend screen's ceremony: the assertion binds to the spend's
 * digest and evaluates the PRF (both request forms, as in the probe);
 * assertion and PRF output leave as `deviceData` — the seed never
 * crosses the page. */
const signCeremony = async (
  input: DeviceSignTx
): Promise<Record<string, unknown>> => {
  if (!input.credentialId) {
    throw new Error("This account's passkey credential is unknown");
  }
  // The challenge is the spend's digest: only this PCZT can be
  // approved by what comes back.
  const challenge = await pcztChallenge(input.pczt);
  const assertion = await startAuthentication({
    optionsJSON: {
      challenge,
      rpId: RP_ID,
      allowCredentials: [{ id: input.credentialId, type: "public-key" }],
      userVerification: "required",
      extensions: {
        prf: {
          // Both request forms, same salt — some providers only
          // process one of them (see the probe).
          eval: { first: PRF_SALT },
          evalByCredential: {
            [input.credentialId]: { first: PRF_SALT },
          },
        },
      },
    },
  });
  const out = assertion.clientExtensionResults?.prf?.results?.first;
  if (!out) throw new PrfMissingError();
  return { assertion, prf: b64url.encode(prfBytes(out)) };
};

/** The spend screen: `blurb` is the one-line custody story. */
export const makePasskeySign = ({
  blurb,
}: {
  blurb: ReactNode;
}): ComponentType<SignProps> => {
  const PasskeySign = ({ input, onResult, onCancel }: SignProps) => {
    const [error, setError] = useState<string>();

    const sign = async () => {
      setError(undefined);
      try {
        const data = await signCeremony(input);
        // Opaque to the contract; the engine decodes and verifies it
        // keyring-side. Throws on a failed submit, which re-arms the view.
        await onResult(JSON.stringify(data));
      } catch (e) {
        setError(passkeyErrorMessage(e));
      }
    };

    return (
      <Stack gap={4} data-testid="device-progress">
        <Stack gap={2}>
          <p className="font-semibold">Sign with your passkey</p>
          <p className="text-sm text-neutral-600">{blurb}</p>
        </Stack>
        {error && (
          <Alert title="Error" type="error">
            {error}
          </Alert>
        )}
        <Stack direction="horizontal" gap={2}>
          <ActionButton
            size="lg"
            backgroundHoverColor="black"
            textHoverColor="primary"
            onClick={() => void sign()}
          >
            Sign
          </ActionButton>
          <ActionButton {...cancelProps(onCancel)}>Cancel</ActionButton>
        </Stack>
      </Stack>
    );
  };
  return PasskeySign;
};
