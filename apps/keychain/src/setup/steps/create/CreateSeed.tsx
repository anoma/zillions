/**
 * Create > step 2: generate + display the seed phrase (12 or 24 words).
 *
 * Generation goes through the typed client; the result lands in wizard state.
 */
import {
  ActionButton,
  Badge,
  RadioGroup,
  SeedPhraseInstructions,
  Stack,
} from "@zillions/components";
import { copyToClipboard } from "@zillions/utils";
import { useEffect, useState } from "react";
import { GoAlertFill, GoCheckCircleFill, GoXCircleFill } from "react-icons/go";

import { useWizard } from "../../SetupContext";
import type { MnemonicLength } from "../../model/secrets";
import { SeedPhraseList } from "../../ui/SeedPhraseList";

export const CreateSeed = () => {
  const { state, dispatch, client } = useWizard();
  const { mnemonic, mnemonicLength } = state;
  const [confirmingCopy, setConfirmingCopy] = useState(false);
  const [copyResult, setCopyResult] = useState<"copied" | "failed">();

  useEffect(() => setConfirmingCopy(false), [mnemonic]);

  const copyAnyway = (): void => {
    setConfirmingCopy(false);
    copyToClipboard(mnemonic.join(" ")).then(
      () => setCopyResult("copied"),
      () => setCopyResult("failed")
    );
  };

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
      <Stack gap={5} full>
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
        <Stack gap={3} full>
          <SeedPhraseList
            columns={mnemonicLength === 24 ? 4 : 3}
            words={mnemonic}
          />
          {confirmingCopy ?
            <div
              role="alert"
              className="flex gap-3 rounded-xl bg-gold-soft px-4 py-3.5 text-on-gold-soft"
              data-testid="setup-copy-warning"
            >
              <GoAlertFill className="mt-0.5 size-4 shrink-0" />
              <div className="flex-1 text-[13px] leading-snug">
                <strong className="block font-semibold">
                  Your clipboard isn&apos;t private
                </strong>
                <span className="block font-medium">
                  Other apps and synced backups can read it. Writing the phrase
                  on paper is safer.
                </span>
                <div className="mt-2.5 flex gap-5">
                  <button
                    type="button"
                    data-testid="setup-copy-to-clipboard-confirm-button"
                    className="text-xs font-semibold underline cursor-pointer"
                    onClick={copyAnyway}
                  >
                    Copy anyway
                  </button>
                  <button
                    type="button"
                    className="text-xs font-medium cursor-pointer hover:underline"
                    autoFocus
                    onClick={() => setConfirmingCopy(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          : <div className="relative">
              <button
                type="button"
                data-testid="setup-copy-to-clipboard-button"
                className="text-black font-medium underline text-xs hover:text-neutral-hover text-center mx-auto block cursor-pointer"
                onClick={() => setConfirmingCopy(true)}
              >
                Copy to Clipboard
              </button>
              {copyResult && (
                <div
                  onAnimationEnd={() => setCopyResult(undefined)}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 animate-feedback"
                >
                  <Badge
                    icon={
                      copyResult === "copied" ?
                        <GoCheckCircleFill />
                      : <GoXCircleFill />
                    }
                    className={
                      copyResult === "copied" ?
                        "whitespace-nowrap bg-success"
                      : "whitespace-nowrap bg-fail"
                    }
                  >
                    {copyResult === "copied" ?
                      "Copied to clipboard"
                    : "Error trying to copy"}
                  </Badge>
                </div>
              )}
            </div>
          }
          <div className="border-t border-line pt-4 pb-6 text-sm">
            <SeedPhraseInstructions />
          </div>
          <ActionButton
            size="lg"
            data-testid="setup-go-to-verification-button"
            className="mt-auto"
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
