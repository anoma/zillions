/**
 * Landing step: choose Create, Import or Connect to Hardware Wallet.
 */
import { ActionButton, Alert, Stack } from "@zillions/components";
import { Logo } from "@zillions/components/assets/Logo";
import { useEffect, useState } from "react";

import {
  connectLedger,
  ledgerErrorMessage,
  UserInteractionRequired,
  type LedgerConnection,
} from "../model/ledger";
import { useWizard } from "../SetupContext";

const INTERACTION_LABEL: Partial<Record<UserInteractionRequired, string>> = {
  [UserInteractionRequired.UnlockDevice]: "Unlock your Ledger",
  [UserInteractionRequired.ConfirmOpenApp]: "Open the Zcash app on your Ledger",
};

export const Start = () => {
  const { dispatch } = useWizard();
  const [connecting, setConnecting] = useState(false);
  const [interaction, setInteraction] = useState<UserInteractionRequired>();
  const [ledger, setLedger] = useState<LedgerConnection>();
  const [error, setError] = useState<string>();

  useEffect(() => () => ledger?.dmk.close(), [ledger]);

  const onConnectLedger = async () => {
    setError(undefined);
    setConnecting(true);
    try {
      setLedger(await connectLedger(setInteraction));
    } catch (e) {
      setError(ledgerErrorMessage(e));
    } finally {
      setConnecting(false);
      setInteraction(undefined);
    }
  };

  const ledgerLabel = ledger
    ? `Connected to ${ledger.deviceName}`
    : connecting
      ? (interaction && INTERACTION_LABEL[interaction]) ?? "Connecting…"
      : "Connect to hardware wallet";

  return (
    <div className="flex flex-col flex-1 justify-center">
      <div className="w-[320px] mx-auto mb-18 text-center">
        <Logo className="w-full" />
      </div>
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
        <ActionButton
          size="lg"
          outlineColor="black"
          backgroundHoverColor="black"
          textHoverColor="primary"
          data-testid="setup-connect-ledger-button"
          disabled={connecting || !!ledger}
          onClick={() => void onConnectLedger()}
        >
          {ledgerLabel}
        </ActionButton>
        {ledger && (
          <p className="text-sm text-center text-neutral-700">
            Zcash app v{ledger.appVersion}
          </p>
        )}
        {error && (
          <Alert title="Error" type="error">
            {error}
          </Alert>
        )}
      </Stack>
    </div>
  );
};
