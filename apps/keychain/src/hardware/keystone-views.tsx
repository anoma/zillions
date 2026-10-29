/**
 * The Keystone screens: everything runs over QRs. Setup scans the account
 * export the device displays; signing shows the PCZT as animated QRs for
 * the device to scan, then scans the signed PCZT back, which leaves as an
 * opaque `deviceData` string — only the engine (`keystone.ts`) interprets
 * it. No session to run: the camera is the transport, so these views are
 * plainer than the Ledger's, with the error and retry handling in view.
 */
import {
  AnimatedQRCode,
  AnimatedQRScanner,
  Purpose,
} from "@keystonehq/animated-qr";
import { ZcashAccounts, ZcashPCZT } from "@keystonehq/bc-ur-registry-zcash";
import { useMemo, useState } from "react";

import { ActionButton, Alert, Stack } from "@zillions/components";

import { deriveAccountFromUfvk } from "../background/crypto/zillions";
import { engines } from "./engines";
import type { DeviceKeys, DeviceSignTx, DeviceViews } from "./types";

const cancelProps = (onClose: () => void) => ({
  size: "lg" as const,
  outlineColor: "black" as const,
  backgroundHoverColor: "black" as const,
  textHoverColor: "primary" as const,
  onClick: onClose,
});

/** Scan the account export the Keystone displays. */
export const KeystoneConnect = ({
  onKeys,
  onClose,
}: {
  onKeys: (keys: DeviceKeys) => Promise<void> | void;
  onClose: () => void;
}) => {
  const [error, setError] = useState<string>();
  // Remounts the scanner, re-asking for the camera after a denial.
  const [attempt, setAttempt] = useState(0);

  const handleScan = async ({ cbor }: { cbor: string }) => {
    try {
      const accounts = ZcashAccounts.fromCBOR(Buffer.from(cbor, "hex"));
      // The device may sync several accounts; take the first.
      const account = accounts.getAccounts()[0];
      if (!account) throw new Error("The Keystone exported no accounts");
      const viewingKey = account.getUfvk();
      // The device exports keys only: derive the addresses it names here,
      // like any account's keys are turned into addresses.
      const addresses = await deriveAccountFromUfvk(viewingKey);
      await onKeys({
        device: "keystone",
        alias: account.getName() || "Keystone",
        viewingKey,
        seedFingerprint: accounts.getSeedFingerprint().toHex(),
        hdIndex: account.getIndex(),
        transparentAddress: addresses.transparent,
        shieldedAddress: addresses.unified,
      });
    } catch (e) {
      setError(engines.keystone.describeError(e));
    }
  };

  return (
    <Stack gap={4} data-testid="device-progress">
      <Stack gap={2}>
        <p className="font-semibold">
          Scan the account QR on the Keystone with the camera below
        </p>
        <p className="text-sm text-neutral-600">
          On the Keystone (Cypherpunk firmware), choose the account to
          connect and open its sync QR. Addresses are derived from the
          viewing key after scanning.
        </p>
        <p className="text-sm text-neutral-600">
          Don&apos;t see a Zcash account on the device? The Zcash app ships
          in Keystone&apos;s Cypherpunk firmware.
        </p>
      </Stack>
      <AnimatedQRScanner
        key={attempt}
        purpose={Purpose.SYNC}
        urTypes={["zcash-accounts"]}
        handleScan={handleScan}
        handleError={setError}
        options={{ width: 500, blur: false }}
      />
      {error && (
        <Alert title="Error" type="error">
          {error}
        </Alert>
      )}
      <Stack direction="horizontal" gap={2}>
        {error && (
          <ActionButton
            size="lg"
            backgroundHoverColor="black"
            textHoverColor="primary"
            onClick={() => {
              setError(undefined);
              setAttempt(attempt + 1);
            }}
          >
            Try again
          </ActionButton>
        )}
        <ActionButton {...cancelProps(onClose)}>Cancel</ActionButton>
      </Stack>
    </Stack>
  );
};

/** Show the PCZT for the device to scan, then scan its signed PCZT back. */
export const KeystoneSign = ({
  input,
  onResult,
  onCancel,
}: {
  input: DeviceSignTx;
  onResult: (deviceData: string) => Promise<void>;
  onCancel: () => void;
}) => {
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);

  const ur = useMemo(
    () => new ZcashPCZT(Buffer.from(input.pczt, "base64")).toUR(),
    [input.pczt]
  );

  const handleScan = ({ cbor }: { cbor: string }) => {
    try {
      const signed = ZcashPCZT.fromCBOR(Buffer.from(cbor, "hex"));
      void onResult(signed.getData().toBase64());
    } catch (e) {
      // A failed submit re-arms the view: the scanner keeps running.
      setError(engines.keystone.describeError(e));
    }
  };

  return (
    <Stack gap={4} data-testid="device-progress">
      <Stack gap={2}>
        <p className="font-semibold">
          Scan this code with the Keystone and approve the transaction
        </p>
        <p className="text-sm text-neutral-600">
          Then point the animated QR the Keystone shows at the camera below.
        </p>
      </Stack>
      <div className="flex justify-center">
        <AnimatedQRCode
          type={ur.type}
          cbor={ur.cbor.toString("hex")}
          options={{ size: 280 }}
        />
      </div>
      <AnimatedQRScanner
        key={attempt}
        purpose={Purpose.SYNC}
        urTypes={["zcash-pczt"]}
        handleScan={handleScan}
        handleError={setError}
        options={{ width: 500, blur: false }}
      />
      {error && (
        <Alert title="Error" type="error">
          {error}
        </Alert>
      )}
      <Stack direction="horizontal" gap={2}>
        {error && (
          <ActionButton
            size="lg"
            backgroundHoverColor="black"
            textHoverColor="primary"
            onClick={() => {
              setError(undefined);
              setAttempt(attempt + 1);
            }}
          >
            Try again
          </ActionButton>
        )}
        <ActionButton {...cancelProps(onCancel)}>Cancel</ActionButton>
      </Stack>
    </Stack>
  );
};

export const keystoneViews: DeviceViews = {
  Connect: KeystoneConnect,
  Sign: KeystoneSign,
};
