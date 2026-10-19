/**
 * Landing step: choose Create, Import or Connect to Hardware Wallet.
 */
import { ActionButton, Stack } from "@zillions/components";
import { Logo } from "@zillions/components/assets/Logo";
import { useRef, useState } from "react";

import {
  canUseHID,
  connectLedger,
  ledgerErrorMessage,
  type LedgerStep,
} from "../model/ledger";
import { useWizard } from "../SetupContext";
import { LedgerProgress } from "../ui/LedgerProgress";
import { saveLedger } from "./ledger/saveLedger";

const STEPS: LedgerStep[] = ["connect", "unlock", "open-app", "confirm-key"];

export const Start = () => {
  const { state, dispatch, client } = useWizard();
  /** Set while a Ledger session runs or has failed. */
  const [step, setStep] = useState<LedgerStep>();
  const [error, setError] = useState<string>();
  const abort = useRef<AbortController>(undefined);

  const onConnectLedger = async () => {
    setError(undefined);
    setStep("connect");
    abort.current = new AbortController();
    const { signal } = abort.current;
    let keys;
    try {
      keys = await connectLedger(setStep, signal);
    } catch (e) {
      if (!signal.aborted) setError(ledgerErrorMessage(e));
      return;
    }
    dispatch({ type: "ledgerConnected", keys });
    // Without a password to set there's nothing to ask: store it right away.
    if (!state.passwordRequired) {
      await saveLedger(client, dispatch, { keys, passwordRequired: false });
    }
  };

  const onCancel = () => {
    abort.current?.abort();
    setStep(undefined);
    setError(undefined);
  };

  return (
    <div className="flex flex-col flex-1 justify-center">
      <div className="w-[320px] mx-auto mb-18 text-center">
        <Logo className="w-full" />
      </div>
      {step ? (
        <LedgerProgress
          steps={STEPS}
          current={step}
          error={error}
          onCancel={onCancel}
          onRetry={() => void onConnectLedger()}
        />
      ) : (
        <Stack as="div" direction="vertical" gap={2}>
          <ActionButton
            size="lg"
            backgroundHoverColor="black"
            textHoverColor="primary"
            data-testid="setup-create-keys-button"
            onClick={() => dispatch({ type: "chooseFlow", flow: "create" })}
          >
            Create new keys
          </ActionButton>
          <ActionButton
            size="lg"
            outlineColor="black"
            backgroundHoverColor="black"
            textHoverColor="primary"
            data-testid="setup-import-keys-button"
            onClick={() => dispatch({ type: "chooseFlow", flow: "import" })}
          >
            Import existing keys
          </ActionButton>
          {canUseHID() && (
            <>
              <ActionButton
                size="lg"
                outlineColor="black"
                backgroundHoverColor="black"
                textHoverColor="primary"
                data-testid="setup-connect-ledger-button"
                onClick={() => void onConnectLedger()}
              >
                Connect to hardware wallet
              </ActionButton>
              <ActionButton
                size="lg"
                outlineColor="black"
                backgroundHoverColor="black"
                textHoverColor="primary"
                data-testid="setup-import-keystone-key-button"
                onClick={() =>
                  dispatch({ type: "chooseFlow", flow: "keystone" })
                }
              >
                Import Keystone key
              </ActionButton>
            </>
          )}
        </Stack>
      )}
    </div>
  );
};
