/**
 * Ledger > step 2: Display Ledger account *
 */
import { ActionButton, Stack } from "@zillions/components";
import { useEffect } from "react";
import { useWizard } from "../../SetupContext";

export const ConnectLedger = () => {
  const { state, dispatch, client } = useWizard();
  const { mnemonic, mnemonicLength } = state;

  // Regenerate whenever the requested length changes.
  useEffect(() => {
    let cancelled = false;
    void client.generateMnemonic(mnemonicLength).then((words) => {
      if (!cancelled) dispatch({ type: "setMnemonic", mnemonic: words });
    });
    return () => {
      cancelled = true;
    };
  }, [client, dispatch, mnemonicLength]);

  return (
    <>
      <Stack gap={5}>
        <Stack gap={3}>
          <div className="border-t border-neutral-300 pt-4 pb-6 text-sm">
            {/* Connect steps */}
            Connect Ledger
          </div>
          <ActionButton
            size="lg"
            data-testid="setup-go-to-verification-button"
            backgroundHoverColor="black"
            textHoverColor="primary"
            disabled={mnemonic.length === 0}
            onClick={() =>
              dispatch({ type: "goToStep", step: "connect.approve" })
            }
          >
            Next
          </ActionButton>
        </Stack>
      </Stack>
    </>
  );
};
