/**
 * The passkey core: the pure half of the passkey device module — no
 * React, no transports — shared by its engine (`passkey-prf.ts`) and its
 * views (via `passkey-view-parts.tsx`). The ceremonies run in extension
 * pages under the dedicated `keychain.zillions.money` RP (see
 * `passkey-constants.ts` for why it's a subdomain nothing serves from);
 * everything here is the fixed frame around them: the RP, the salt, the
 * challenge binding, the origin checks, and the seed math.
 */
import {
  type AuthenticationResponseJSON,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import browser from "webextension-polyfill";

import { deriveSeed } from "./passkey-seed";

// The consensus constants live in a zero-import leaf module so the build
// derives the manifest's host permission from the very same values.
export { PRF_SALT, RP_ID, RP_NAME } from "./passkey-constants";

import { RP_ID } from "./passkey-constants";

/** base64url: the encoding every WebAuthn field travels across as JSON. */
export const b64url = {
  encode: (bytes: Uint8Array): string =>
    btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, ""),
  decode: (text: string): Uint8Array<ArrayBuffer> => {
    const padded =
      text.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (text.length % 4)) % 4);
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  },
};

/** base64: the encoding the vault stores binary at-rest fields in. */
export const b64 = {
  encode: (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)),
  decode: (text: string): Uint8Array<ArrayBuffer> =>
    Uint8Array.from(atob(text), (c) => c.charCodeAt(0)),
};

/**
 * SHA-256 of the unsigned PCZT's bytes (base64), as base64url: the WebAuthn
 * challenge a spend ceremony binds to. The view hashes the PCZT the popup
 * holds; the engine re-hashes its own copy — an assertion can only match
 * the exact transaction it claims to approve.
 */
export const pcztChallenge = async (pczt: string): Promise<string> => {
  const bytes = Uint8Array.from(atob(pczt), (c) => c.charCodeAt(0));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return b64url.encode(digest);
};

/**
 * The origins our extension pages may run a `zillions.money` passkey from.
 * Chrome's extension id is opaque and unique per install; Firefox derives a
 * stable one by SHA-256 of the add-on id, each byte rendered as two base-16
 * characters offset by `a`. Computed per verify: the id differs across
 * browsers and unpacked builds.
 */
export const extensionOrigins = async (): Promise<string[]> => {
  const id = browser.runtime.id;
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id))
  );
  const firefox = [...digest]
    .map((b) => String.fromCharCode((b >> 4) + 97, (b & 15) + 97))
    .join("");
  return [`chrome-extension://${id}`, `moz-extension://${firefox}`];
};

/**
 * Best-effort zero-fill: writes through any view into a buffer the
 * browser owns (the ceremony's PRF output, which the response object
 * still references) and ignores a buffer that refuses (frozen). The last
 * write every secret byte we hold gets.
 */
export const zeroBytes = (bytes: Uint8Array): void => {
  try {
    bytes.fill(0);
  } catch {
    // The browser owns this buffer now; zeroing is best effort.
  }
};

/**
 * Run `fn` with the seed the PRF output stands for, then leave nothing:
 * the seed and the entropy are zero-filled on every exit, throws
 * included. The entropy is usually a view into the browser's ceremony
 * buffer, so zeroing it scrubs the copy the response object still holds;
 * `fn` must not retain the seed past the call. Everything the account's
 * keys derive from lives and dies inside this call.
 */
export const withPrfSeed = async <T>(
  entropy: Uint8Array<ArrayBuffer>,
  fn: (seed: Uint8Array) => Promise<T>
): Promise<T> => {
  try {
    const seed = await deriveSeed(entropy);
    try {
      return await fn(seed);
    } finally {
      zeroBytes(seed);
    }
  } finally {
    zeroBytes(entropy);
  }
};

/** Whether this browser can run the ceremonies at all: WebAuthn in the
 * extension page, from an origin scheme this extension verifies against.
 * The scheme gate excludes browsers whose extension pages use another
 * scheme (Edge and Opera use `extension://`), where every ceremony's
 * origin check would fail — the passkey option is never offered there.
 * The RP claim itself needs the browser versions the manifest already
 * floors (Chrome 122+, Firefox 150+); older browsers fail loudly at the
 * ceremony, which `describeError` turns into copy (spike pending:
 * FINDINGS §9.6). */
export const passkeySupported = (): boolean => {
  if (
    typeof navigator.credentials?.get !== "function" ||
    typeof navigator.credentials?.create !== "function"
  ) {
    return false;
  }
  const scheme = globalThis.location?.protocol;
  return scheme === "chrome-extension:" || scheme === "moz-extension:";
};

/**
 * Whether the BROWSER (not the passkey provider) can evaluate a PRF at
 * all, per `PublicKeyCredential.getClientCapabilities()`. Three states:
 * `true` — the browser supports it (the provider may still refuse; the
 * probe decides); `false` — no provider can evaluate one here, so the
 * connect can skip its doomed ceremony; `undefined` — the capability API
 * is absent, so nothing is known and the probe decides.
 */
export const browserPrfSupport = async (): Promise<boolean | undefined> => {
  if (typeof PublicKeyCredential?.getClientCapabilities !== "function") {
    return undefined;
  }
  try {
    const caps = await PublicKeyCredential.getClientCapabilities();
    return caps["extension:prf"] === true;
  } catch {
    // An implementation that can't answer tells us nothing.
    return undefined;
  }
};

/**
 * Verify a passkey assertion: signature against the credential's stored
 * COSE public key, the expected challenge (the transaction's digest when
 * signing), the RP and our own extension origins, and the UV flag. Signature
 * counters are not tracked: synced passkeys don't advance them.
 */
export const verifyAssertion = async (
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  credentialPublicKey: Uint8Array<ArrayBuffer>
): Promise<void> => {
  const verified = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: await extensionOrigins(),
    expectedRPID: RP_ID,
    credential: { id: response.id, publicKey: credentialPublicKey, counter: 0 },
    requireUserVerification: true,
  });
  if (!verified.verified) {
    throw new Error("The passkey's response failed verification");
  }
};

/**
 * The PRF output a get() ceremony hands over is raw bytes inside the
 * browser's client extension results; `deviceData` carries it as base64url
 * for the engine to re-derive the seed from.
 */
export const prfBytes = (first: unknown): Uint8Array<ArrayBuffer> => {
  if (first instanceof ArrayBuffer) return new Uint8Array(first);
  const view = first as ArrayBufferView;
  return new Uint8Array(
    view.buffer as ArrayBuffer,
    view.byteOffset,
    view.byteLength
  );
};

/** Thrown when a passkey won't evaluate a PRF here. At connect this is
 * the explicit "choose another import mechanism" outcome — there is no
 * stored-key fallback — and at sign time, where the account's mode is
 * fixed, it surfaces through `describeError`. */
export class PrfMissingError extends Error {
  constructor() {
    super(
      "This passkey can't derive keys in this browser. Try the same " +
        "synced passkey in a browser that supports it."
    );
    this.name = "PrfMissingError";
  }
}

/** Whether an error means "no PRF support here" however it surfaced: the
 * probe answered without an output, or the ceremony refused the extension
 * outright. Both fail the connect explicitly — a user cancellation
 * (`NotAllowedError`) never does. */
export const isPrfMissing = (e: unknown): boolean =>
  e instanceof PrfMissingError ||
  (e instanceof Error && e.name === "NotSupportedError");

export const passkeyErrorMessage = (e: unknown): string => {
  if (e instanceof Error) {
    switch (e.name) {
      case "NotAllowedError":
        return "The passkey request was dismissed or timed out";
      case "SecurityError":
        return (
          "This browser won't let this extension run passkey ceremonies. " +
          "Passkeys open accounts in Chrome 122+, Firefox 150+ and their " +
          "forks."
        );
      case "InvalidStateError":
        return "The passkey was already taken by another account";
      case "NotSupportedError":
        return (
          "This browser can't derive keys from passkeys, so this spend " +
          "can't be signed"
        );
      default:
        return e.message;
    }
  }
  return String(e);
};
