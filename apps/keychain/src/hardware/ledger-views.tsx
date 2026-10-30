/**
 * The Ledger screens: read the account keys off the device (setup wizard)
 * and have it sign a PCZT (approval popup). Both drive a session through the
 * same connect → unlock → open-app machine, reporting progress through
 * `DeviceProgress`; the signing output leaves as an opaque `deviceData`
 * string — only the engine (`ledger.ts`) decodes it.
 */
import { useEffect, useRef, useState } from "react";

import {
  initZillionsSdk,
  ledgerTransaction,
} from "../background/crypto/zillions";
import { engines } from "./engines";
import { DeviceProgress } from "./device-progress";
import {
  connectLedger,
  LEDGER_STEPS,
  signLedgerPczt,
  withLedger,
  type LedgerStep,
} from "./ledger-session";
import type {
  DeviceKeys,
  DeviceProgressStep,
  DeviceSignTx,
  DeviceViews,
} from "./types";

const CONNECT_STEPS: DeviceProgressStep[] = (
  ["connect", "unlock", "open-app", "confirm-key"] as const
).map((key) => LEDGER_STEPS[key]);

const SIGN_STEPS: DeviceProgressStep[] = (
  ["connect", "unlock", "open-app", "sign"] as const
).map((key) => LEDGER_STEPS[key]);

/** Read the account's public keys off the device; runs the session on mount. */
export const LedgerConnect = ({
  onKeys,
  onClose,
}: {
  onKeys: (keys: DeviceKeys) => Promise<void> | void;
  onClose: () => void;
}) => {
  const [step, setStep] = useState<LedgerStep>("connect");
  const [error, setError] = useState<string>();
  const abort = useRef<AbortController>(undefined);

  const connect = async (): Promise<void> => {
    setError(undefined);
    abort.current = new AbortController();
    const { signal } = abort.current;
    let keys;
    try {
      keys = await connectLedger(setStep, signal);
    } catch (e) {
      if (!signal.aborted) setError(engines.ledger.describeError(e));
      return;
    }
    await onKeys(keys);
  };

  useEffect(() => {
    void connect();
    // Run the session once; retry goes through the progress UI's button.
  }, []);

  return (
    <DeviceProgress
      steps={CONNECT_STEPS}
      current={step}
      error={error}
      onCancel={() => {
        abort.current?.abort();
        onClose();
      }}
      onRetry={() => void connect()}
    />
  );
};

/** Have the device sign the PCZT, then hand over the opaque signing output. */
export const LedgerSign = ({
  input,
  onResult,
  onCancel,
}: {
  input: DeviceSignTx;
  onResult: (deviceData: string) => Promise<void>;
  onCancel: () => void;
}) => {
  const [step, setStep] = useState<LedgerStep>("connect");
  const [error, setError] = useState<string>();
  const abort = useRef<AbortController>(undefined);
  // One sign attempt at a time; a failed submit re-arms for a retry.
  const running = useRef(false);

  const sign = async (): Promise<void> => {
    if (running.current) return;
    running.current = true;
    setError(undefined);
    abort.current = new AbortController();
    const { signal } = abort.current;
    try {
      const signatures = await withLedger(
        setStep,
        async (device) => {
          await initZillionsSdk();
          const transaction = ledgerTransaction(input.pczt, input.hdIndex);
          return signLedgerPczt(device, transaction, setStep);
        },
        signal,
      );
      await onResult(JSON.stringify(signatures));
    } catch (e) {
      // The request stays pending until the background takes the signatures.
      running.current = false;
      if (signal.aborted) return;
      setError(engines.ledger.describeError(e));
    }
  };

  useEffect(() => {
    void sign();
    // Run the session once; retry goes through the progress UI's button.
  }, []);

  return (
    <DeviceProgress
      steps={SIGN_STEPS}
      current={step}
      error={error}
      onCancel={() => {
        abort.current?.abort();
        onCancel();
      }}
      onRetry={() => void sign()}
    />
  );
};

export const ledgerViews: DeviceViews = {
  Connect: LedgerConnect,
  Sign: LedgerSign,
};
