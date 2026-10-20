/**
 * Landing step: choose Create, Import or Connect to Hardware Wallet.
 */
import { ActionButton, Alert, Stack } from "@zillions/components";
import { Logo } from "@zillions/components/assets/Logo";
import { useState } from "react";

import {
  connectLedger,
  ledgerErrorMessage,
  UserInteractionRequired,
} from "../model/ledger";
import { useWizard } from "../SetupContext";
import { saveLedger } from "./ledger/saveLedger";

const INTERACTION_LABEL: Partial<Record<UserInteractionRequired, string>> = {
  [UserInteractionRequired.UnlockDevice]: "Unlock your Ledger",
  [UserInteractionRequired.ConfirmOpenApp]: "Open the Zcash app on your Ledger",
};

export const Start = () => {
  const { state, dispatch, client } = useWizard();
  const [connecting, setConnecting] = useState(false);
  const [interaction, setInteraction] = useState<UserInteractionRequired>();
  const [error, setError] = useState<string>();

  const onConnectLedger = async () => {
    setError(undefined);
    setConnecting(true);
    let keys;
    try {
      keys = await connectLedger(setInteraction);
    } catch (e) {
      setError(ledgerErrorMessage(e));
      setConnecting(false);
      setInteraction(undefined);
      return;
    }
    dispatch({ type: "ledgerConnected", keys });
    // Without a password to set there's nothing to ask: store it right away.
    if (!state.passwordRequired) {
      await saveLedger(client, dispatch, { keys, passwordRequired: false });
    }
  };

  const ledgerLabel = connecting
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
          disabled={connecting}
          onClick={() => void onConnectLedger()}
        >
          {ledgerLabel}
        </ActionButton>
        {error && (
          <Alert title="Error" type="error">
            {error}
          </Alert>
        )}
      </Stack>
    </div>
  );
};
