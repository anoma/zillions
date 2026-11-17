/**
 * The passkey screens. Every ceremony runs in this extension page — the
 * extension claims the dedicated `keychain.zillions.money` RP through the
 * manifest's host permissions (see `passkey-constants.ts`) — so the
 * browser's own passkey dialog is the transport and every assertion's
 * origin is this extension's own.
 *
 * The connect screen offers both paths. Creating makes a credential with
 * the PRF salt evaluated at create — one ceremony where the provider
 * supports it (synced providers do) — and otherwise probes with a get()
 * ceremony (CTAP2.0-era keys, get-only providers). Importing runs a
 * discovery get() listing the synced passkeys the browser already holds
 * for the RP, recovering the account one of them was created for. Either
 * way the output both proves the passkey can derive keys and is the
 * entropy itself: the wasm seed → the account's public keys. The seed's
 * whole life is its derivation scope, zero-filled on exit, and no phrase
 * is ever built as text — the passkey itself is the backup. Signing asks
 * the user to verify the spend's digest; its
 * assertion and the PRF output leave as the opaque `deviceData` string —
 * only the engine (`passkey-prf.ts`) interprets it.
 */
import { useEffect, useState } from "react";

import { Alert, Stack } from "@zillions/components";
import { PiFingerprint, PiPlusCircle } from "react-icons/pi";

import {
  computeSeedFingerprint,
  deriveAccount,
} from "../background/crypto/zillions";
import type { DeviceCredential } from "../ipc/contract";
import { freeAlias } from "../setup/model/alias";
import { OptionCard } from "../setup/ui/OptionCard";
import { engines } from "./engines";
import {
  RP_ID,
  b64,
  browserPrfSupport,
  isPrfMissing,
  withPrfSeed,
} from "./passkey-core";
import {
  createCredential,
  importCredential,
  makePasskeySign,
  probePrf,
} from "./passkey-view-parts";
import type { DeviceKeys, DeviceViews } from "./types";

/** The explicit no-PRF outcome, shared by the pre-flight warning and both
 * ceremonies' failures: the derivation cannot happen here, and the user
 * picks another path. */
const passkeyMissingPrfCopy =
  "This passkey's provider won't evaluate a PRF in this browser, so no " +
  "keys can be derived from it. Cancel and choose a different way to " +
  "create or import keys.";

/** A dismissed import picker: one signal for "nothing picked" and "no
 * passkeys here" alike — WebAuthn can't tell them apart — so the copy
 * reads true for both and suggests creating. */
const importDismissedCopy =
  "No existing passkey was used. Create a new one, or try again.";

/** A failed create: WebAuthn reports a dismissed dialog and a key that
 * can't store a discoverable passkey alike, so the copy covers both. */
const createDismissedCopy =
  "No passkey was created. If your security key was refused, it may be " +
  "full or unable to keep passkeys: use a synced passkey, or a key with " +
  "room for one more.";

/** The connect's error copy, per path. */
const errorCopy = (e: unknown, path: "create" | "import"): string => {
  if (isPrfMissing(e)) return passkeyMissingPrfCopy;
  if (e instanceof Error && e.name === "NotAllowedError") {
    return path === "import" ? importDismissedCopy : createDismissedCopy;
  }
  return engines["passkey-prf"].describeError(e);
};

export const PasskeyConnect = ({
  onKeys,
  takenAliases = [],
}: {
  onKeys: (keys: DeviceKeys) => Promise<void> | void;
  takenAliases?: string[];
}) => {
  // busy: a ceremony running, then the wizard storing the account.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // The browser-level PRF support, once and only when it can be known:
  // `undefined` (capability API absent) means nothing and the probe
  // decides; `false` means no provider can evaluate a PRF here, so the
  // ceremony is skipped rather than doomed.
  const [prfSupport, setPrfSupport] = useState<boolean | undefined>();
  useEffect(() => {
    void browserPrfSupport().then(setPrfSupport);
  }, []);

  // PRF output → seed → the account's public keys, stored under the
  // credential that produced it. The seed's whole life is this call —
  // `withPrfSeed` zero-fills it and the PRF output on every exit — and
  // no phrase is ever built as text: the passkey itself is the backup.
  const connectKeys = async (
    credential: DeviceCredential,
    prfOutput: Uint8Array<ArrayBuffer>,
    alias: string
  ) => {
    await withPrfSeed(prfOutput, async (seed) => {
      const account = await deriveAccount(seed, 0);
      await onKeys({
        device: "passkey-prf",
        alias,
        viewingKey: account.ufvk,
        seedFingerprint: computeSeedFingerprint(seed),
        hdIndex: 0,
        transparentAddress: account.transparent,
        shieldedAddress: account.unified,
        credential,
      });
    });
  };

  const createAndConnect = async () => {
    // The password manager lists the passkey under this name, so passkeys
    // stay told apart when importing.
    const alias = freeAlias("Passkey", takenAliases);
    setError(undefined);
    setBusy(true);
    try {
      // Create the credential with the PRF salt evaluated inline:
      // providers that evaluate at create return the output here — one
      // ceremony, one dialog. Otherwise probe: a get() ceremony
      // evaluating the salt for the new credential (CTAP2.0-era keys
      // and get-only providers answer here, not at create).
      const { reg, credential, prf } = await createCredential(alias);
      const prfOutput = prf ?? (await probePrf(reg, credential.publicKey));
      await connectKeys(
        {
          id: reg.id,
          rpId: RP_ID,
          publicKey: b64.encode(credential.publicKey),
        },
        prfOutput,
        alias
      );
    } catch (e) {
      setError(errorCopy(e, "create"));
      setBusy(false);
    }
  };

  const importAndConnect = async () => {
    setError(undefined);
    setBusy(true);
    try {
      const { assertion, prf: prfOutput } = await importCredential();
      // The passkey's own name can't be read back; setup numbers this
      // default like any device's.
      await connectKeys(
        { id: assertion.id, rpId: RP_ID },
        prfOutput,
        "Passkey"
      );
    } catch (e) {
      setError(errorCopy(e, "import"));
      setBusy(false);
    }
  };

  return (
    <Stack gap={4} data-testid="device-progress">
      {/* The no-PRF alert below says the cause definitively; the hedged
          preview is noise once that alert is up. */}
      {prfSupport !== false && (
        <p className="text-sm text-neutral-600">
          The passkey must support key derivation (a PRF). If the request
          fails, its provider won&apos;t evaluate one.
        </p>
      )}
      {prfSupport === false && (
        <Alert title="This browser can't derive keys from passkeys" type="error">
          {passkeyMissingPrfCopy}
        </Alert>
      )}
      {error && (
        <Alert title="Error" type="error">
          {error}
        </Alert>
      )}
      <Stack as="div" direction="vertical" gap={2.5}>
        {/* Both cards disable together: a browser that reports no PRF
            support cannot evaluate one for any provider — create would
            only mint an orphaned credential, and import would end in the
            no-PRF error (unknown support stays enabled: the probe
            decides) — and while a ceremony is running, so a second click
            can't start another one mid-flight. The header's back button
            is the way out, like the hardware picker's. */}
        <OptionCard
          more
          disabled={prfSupport === false || busy}
          icon={<PiPlusCircle />}
          title="Create a new passkey"
          subtitle="A new passkey makes a new account"
          data-testid="setup-connect-passkey-create-button"
          onClick={() => void createAndConnect()}
        />
        <OptionCard
          more
          disabled={prfSupport === false || busy}
          icon={<PiFingerprint />}
          title="Use an existing passkey"
          subtitle="Recover the account it was created for"
          data-testid="setup-connect-passkey-import-button"
          onClick={() => void importAndConnect()}
        />
      </Stack>
    </Stack>
  );
};

const PasskeySign = makePasskeySign({
  blurb: (
    <>
      The passkey dialog appears next: verify yourself, and the passkey
      signs the transaction above. Only this Keychain window ever asks for
      your Zillions passkey: if a web page asks, it can take your account.
    </>
  ),
});

export const passkeyPrfViews: DeviceViews = {
  Connect: PasskeyConnect,
  Sign: PasskeySign,
};
