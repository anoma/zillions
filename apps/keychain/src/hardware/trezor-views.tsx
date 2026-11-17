/**
 * The Trezor screens: read the account keys off the device (setup wizard)
 * and have it sign a PCZT (approval popup). Both drive a session through the
 * same connect → pair → unlock machine, reporting progress through
 * `DeviceProgress`; when the device asks for its PIN, a pad takes it by the
 * positions the device's screen shows. The signing output leaves as an
 * opaque `deviceData` string — only the engine (`trezor.ts`) decodes it.
 */
import { ActionButton } from "@zillions/components";
import { useEffect, useRef, useState } from "react";

import { engines } from "./engines";
import { DeviceProgress } from "./device-progress";
import {
  connectTrezor,
  onTrezorUiRequest,
  signTrezorPczt,
  submitTrezorPin,
  TREZOR_STEPS,
  type TrezorStep,
  type TrezorUiRequest,
} from "./trezor-session";
import type {
  DeviceKeys,
  DeviceProgressStep,
  DeviceSignTx,
  DeviceViews,
} from "./types";

const CONNECT_STEPS: DeviceProgressStep[] = (
  ["connect", "pair", "unlock", "confirm-key"] as const
).map((key) => TREZOR_STEPS[key]);

const SIGN_STEPS: DeviceProgressStep[] = (
  ["connect", "unlock", "sign"] as const
).map((key) => TREZOR_STEPS[key]);

/** When the device waits on its PIN: the pad takes the typed positions. */
const TrezorPinPad = ({ onSubmit }: { onSubmit: (pin: string) => void }) => {
  const [pin, setPin] = useState("");
  return (
    <div className="bg-black/[0.05] rounded-xl p-5 flex flex-col gap-3">
      <p className="text-[13px] font-medium text-muted">
        Type your PIN the way it sits on the screen of the Trezor — the pad is
        the positions of that screen.
      </p>
      <div className="text-2xl font-semibold tracking-[0.4em] min-h-8">
        {"•".repeat(pin.length)}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((position) => (
          <ActionButton
            key={position}
            onClick={() => setPin((p) => (p.length < 9 ? `${p}${position}` : p))}
          >
            {position}
          </ActionButton>
        ))}
      </div>
      <div className="flex gap-2">
        <ActionButton onClick={() => setPin((p) => p.slice(0, -1))}>
          Delete
        </ActionButton>
        <ActionButton
          onClick={() => onSubmit(pin)}
          disabled={pin.length < 4}
        >
          Unlock
        </ActionButton>
      </div>
    </div>
  );
};

/** What the device waits on from the host, as the views render it. */
const useTrezorUi = (): TrezorUiRequest => {
  const [request, setRequest] = useState<TrezorUiRequest>({ kind: "idle" });
  useEffect(() => onTrezorUiRequest(setRequest), []);
  return request;
};

/** Read the account's public keys off the device; runs the session on mount. */
export const TrezorConnectView = ({
  onKeys,
  onClose,
}: {
  onKeys: (keys: DeviceKeys) => Promise<void> | void;
  onClose: () => void;
}) => {
  const [step, setStep] = useState<TrezorStep>("connect");
  const [error, setError] = useState<string>();
  const abort = useRef<AbortController>(undefined);
  // One connect attempt at a time; a failed start re-arms for a retry.
  const running = useRef(false);
  const ui = useTrezorUi();

  const connect = async (): Promise<void> => {
    if (running.current) return;
    running.current = true;
    setError(undefined);
    abort.current = new AbortController();
    const { signal } = abort.current;
    let keys;
    try {
      keys = await connectTrezor(setStep, signal);
    } catch (e) {
      running.current = false;
      if (!signal.aborted) setError(engines.trezor.describeError(e));
      return;
    }
    await onKeys(keys);
  };

  useEffect(() => {
    void connect();
    // Run the session once; retry goes through the progress UI's button.
  }, []);

  // A PIN request pauses the ceremony mid-step: show the pad as the step.
  const current = ui.kind === "pin" ? "unlock" : step;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <DeviceProgress
        steps={CONNECT_STEPS}
        current={current}
        error={error}
        onCancel={() => {
          abort.current?.abort();
          onClose();
        }}
        onRetry={() => void connect()}
      />
      {ui.kind === "pin" && !error && (
        <TrezorPinPad onSubmit={submitTrezorPin} />
      )}
    </div>
  );
};

/** Have the device sign the PCZT, then hand over the opaque signing output. */
export const TrezorSignView = ({
  input,
  onResult,
  onCancel,
}: {
  input: DeviceSignTx;
  onResult: (deviceData: string) => Promise<void>;
  onCancel: () => void;
}) => {
  const [step, setStep] = useState<TrezorStep>("connect");
  const [error, setError] = useState<string>();
  const abort = useRef<AbortController>(undefined);
  // One sign attempt at a time; a failed submit re-arms for a retry.
  const running = useRef(false);
  const ui = useTrezorUi();

  const sign = async (): Promise<void> => {
    if (running.current) return;
    running.current = true;
    setError(undefined);
    abort.current = new AbortController();
    const { signal } = abort.current;
    try {
      const signatures = await signTrezorPczt(input.pczt, setStep, signal);
      await onResult(JSON.stringify(signatures));
    } catch (e) {
      // The request stays pending until the background takes the signatures.
      running.current = false;
      if (signal.aborted) return;
      setError(engines.trezor.describeError(e));
    }
  };

  useEffect(() => {
    void sign();
    // Run the session once; retry goes through the progress UI's button.
  }, []);

  // A PIN request pauses the ceremony mid-step: show the pad as the step.
  const current = ui.kind === "pin" ? "unlock" : step;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <DeviceProgress
        steps={SIGN_STEPS}
        current={current}
        error={error}
        onCancel={() => {
          abort.current?.abort();
          onCancel();
        }}
        onRetry={() => void sign()}
      />
      {ui.kind === "pin" && !error && (
        <TrezorPinPad onSubmit={submitTrezorPin} />
      )}
    </div>
  );
};

export const trezorViews: DeviceViews = {
  Connect: TrezorConnectView,
  Sign: TrezorSignView,
};
