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
 * entropy itself: the wasm seed → the account's public keys. The 24-word
 * encoding of the seed is derived but never rendered — the passkey itself
 * is the backup. Signing asks the user to verify the spend's digest; its
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
import { OptionCard } from "../setup/ui/OptionCard";
import { engines } from "./engines";
import {
  RP_ID,
  b64,
  browserPrfSupport,
  isPrfMissing,
  seedFromEntropy,
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

/** The connect's error copy, per path. */
const errorCopy = (e: unknown, path: "create" | "import"): string => {
  if (isPrfMissing(e)) return passkeyMissingPrfCopy;
  if (path === "import" && e instanceof Error && e.name === "NotAllowedError") {
    return importDismissedCopy;
  }
  return engines["passkey-prf"].describeError(e);
};

export const PasskeyConnect = ({
  onKeys,
}: {
  onKeys: (keys: DeviceKeys) => Promise<void> | void;
}) => {
  // choose: create or import; busy: the ceremony running, then the
  // wizard storing the account. A dismissed or empty picker comes back
  // here — both are the same NotAllowedError.
  const [stage, setStage] = useState<"choose" | "busy">("choose");
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
  // credential that produced it. The phrase that encodes the seed stays
  // local — it is never shown and never crosses the IPC boundary; the
  // passkey itself is the backup.
  const connectKeys = async (
    credential: DeviceCredential,
    prfOutput: Uint8Array<ArrayBuffer>
  ) => {
    const { seed } = await seedFromEntropy(prfOutput);
    const account = await deriveAccount(seed, 0);
    await onKeys({
      device: "passkey-prf",
      alias: "Passkey",
      viewingKey: account.ufvk,
      seedFingerprint: computeSeedFingerprint(seed),
      hdIndex: 0,
      transparentAddress: account.transparent,
      shieldedAddress: account.unified,
      credential,
    });
  };

  const createAndConnect = async () => {
    setError(undefined);
    setStage("busy");
    try {
      // Create the credential with the PRF salt evaluated inline:
      // providers that evaluate at create return the output here — one
      // ceremony, one dialog. Otherwise probe: a get() ceremony
      // evaluating the salt for the new credential (CTAP2.0-era keys
      // and get-only providers answer here, not at create).
      const { reg, credential, prf } = await createCredential();
      const prfOutput = prf ?? (await probePrf(reg, credential.publicKey));
      await connectKeys(
        {
          id: reg.id,
          rpId: RP_ID,
          publicKey: b64.encode(credential.publicKey),
        },
        prfOutput
      );
    } catch (e) {
      setError(errorCopy(e, "create"));
      setStage("choose");
    }
  };

  const importAndConnect = async () => {
    setError(undefined);
    setStage("busy");
    try {
      const { assertion, prf: prfOutput } = await importCredential();
      await connectKeys({ id: assertion.id, rpId: RP_ID }, prfOutput);
    } catch (e) {
      setError(errorCopy(e, "import"));
      setStage("choose");
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
          disabled={prfSupport === false || stage === "busy"}
          icon={<PiPlusCircle />}
          title="Create a new passkey"
          subtitle="A new passkey makes a new account"
          data-testid="setup-connect-passkey-create-button"
          onClick={() => void createAndConnect()}
        />
        <OptionCard
          more
          disabled={prfSupport === false || stage === "busy"}
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
      signs this exact transaction. The seed is never stored anywhere.
    </>
  ),
});

export const passkeyPrfViews: DeviceViews = {
  Connect: PasskeyConnect,
  Sign: PasskeySign,
};
