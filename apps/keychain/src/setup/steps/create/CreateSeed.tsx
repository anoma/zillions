/**
 * Create > step 2: generate + display the seed phrase (12 or 24 words).
 *
 * Generation goes through the typed client; the result lands in wizard state.
 */
import {
  ActionButton,
  FeedbackButton,
  RadioGroup,
  SeedPhraseInstructions,
  Stack,
} from "@zillions/components";
import { copyToClipboard } from "@zillions/utils";
import { useEffect } from "react";

import { useWizard } from "../../SetupContext";
import type { MnemonicLength } from "../../model/secrets";
import { SeedPhraseList } from "../../ui/SeedPhraseList";

export const CreateSeed = () => {
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
        <RadioGroup
          id="mnemonicLength"
          groupLabel="Number of seeds"
          value={mnemonicLength.toString()}
          options={[
            { text: "12 words", value: "12" },
            { text: "24 words", value: "24" },
          ]}
          onChange={(value) =>
            dispatch({
              type: "setMnemonicLength",
              length: Number(value) as MnemonicLength,
            })
          }
        />
        <Stack gap={3}>
          <SeedPhraseList
            columns={mnemonicLength === 24 ? 4 : 3}
            words={mnemonic}
          />
          <FeedbackButton
            data-testid="setup-copy-to-clipboard-button"
            className="text-center mx-auto block cursor-pointer"
            successMessage="Copied to clipboard"
            errorMessage="Error trying to copy"
            onAction={() => copyToClipboard(mnemonic.join(" "))}
          >
            Copy to Clipboard
          </FeedbackButton>
          <div className="border-t border-neutral-300 pt-4 pb-6 text-sm">
            <SeedPhraseInstructions />
          </div>
          <ActionButton
            size="lg"
            data-testid="setup-go-to-verification-button"
            backgroundHoverColor="black"
            textHoverColor="primary"
            disabled={mnemonic.length === 0}
            onClick={() => dispatch({ type: "goToStep", step: "create.confirm" })}
          >
            Next
          </ActionButton>
        </Stack>
      </Stack>
    </>
  );
};
