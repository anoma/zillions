/**
 * Import > step 1: enter a mnemonic (12/24), private key, or spending key.
 * Mnemonic validity is checked via the typed client, which returns a structured
 * `invalidWordIndex` for highlighting.
 */
import { ActionButton, Alert, Input, RadioGroup, Stack } from "@zillions/components";
import clsx from "clsx";
import { useCallback, useState } from "react";

import { useWizard } from "../../SetupContext";
import {
  validatePrivateKey,
  validateSpendingKey,
  type MnemonicLength,
  type SecretKind,
} from "../../model/secrets";
import { SeedPhraseList } from "../../ui/SeedPhraseList";

const SHORT = 12;
const LONG = 24;

// Radio option values map to a SecretKind (+ length for mnemonics).
type Option = "12" | "24" | "private-key" | "spending-key";

const optionToKind = (opt: Option): { kind: SecretKind; length: MnemonicLength } => {
  switch (opt) {
    case "12":
      return { kind: "mnemonic", length: 12 };
    case "24":
      return { kind: "mnemonic", length: 24 };
    case "private-key":
      return { kind: "private-key", length: 12 };
    case "spending-key":
      return { kind: "spending-key", length: 12 };
  }
};

export const ImportSecret = () => {
  const { state, dispatch, client } = useWizard();
  const { secretKind, mnemonicLength, privateKey, spendingKey } = state;

  const option: Option =
    secretKind === "mnemonic" ? (String(mnemonicLength) as Option) : secretKind;
  const [words, setWords] = useState<string[]>(Array.from({ length: LONG }, () => ""));
  const [invalidWordIndex, setInvalidWordIndex] = useState<number>();
  const [mnemonicError, setMnemonicError] = useState<string>();

  const privateKeyError = (() => {
    const v = validatePrivateKey(privateKey);
    return v.ok ? "" : v.error;
  })();
  const spendingKeyError = (() => {
    const v = validateSpendingKey(spendingKey);
    return v.ok ? "" : v.error;
  })();

  const isMnemonic = secretKind === "mnemonic";

  const submitDisabled =
    secretKind === "private-key" ? privateKey === "" || privateKeyError !== ""
    : secretKind === "spending-key" ? spendingKey === "" || spendingKeyError !== ""
    : words.slice(0, mnemonicLength).some((w) => !w);

  const onWordChange = useCallback((index: number, value: string) => {
    setWords((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const onPaste = useCallback(
    (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData
        .getData("Text")
        .trim()
        .split(/\s+/)
        .slice(0, LONG);
      if (pasted.length <= 1) return; // single word: default behavior
      e.preventDefault();
      if (pasted.length > SHORT) {
        dispatch({ type: "setMnemonicLength", length: 24 });
        dispatch({ type: "setSecretKind", kind: "mnemonic" });
      }
      setWords((prev) => {
        const next = [...prev];
        for (let i = 0; i < pasted.length && index + i < next.length; i++) {
          next[index + i] = pasted[i];
        }
        return next;
      });
    },
    [dispatch]
  );

  const onChangeOption = (value: string): void => {
    const { kind, length } = optionToKind(value as Option);
    dispatch({ type: "setSecretKind", kind });
    if (kind === "mnemonic") dispatch({ type: "setMnemonicLength", length });
    setMnemonicError(undefined);
    setInvalidWordIndex(undefined);
  };

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (submitDisabled) return;

    if (secretKind === "private-key") {
      dispatch({ type: "goToStep", step: "import.name" });
      return;
    }
    if (secretKind === "spending-key") {
      dispatch({ type: "goToStep", step: "import.name" });
      return;
    }

    const phraseWords = words.slice(0, mnemonicLength);
    const result = await client.validateMnemonic(phraseWords.join(" "));
    if (result.isValid) {
      setMnemonicError(undefined);
      setInvalidWordIndex(undefined);
      dispatch({ type: "setMnemonic", mnemonic: phraseWords });
      dispatch({ type: "goToStep", step: "import.name" });
    } else {
      setInvalidWordIndex(result.invalidWordIndex);
      setMnemonicError(result.error ?? "Invalid mnemonic");
    }
  };

  return (
    <Stack as="form" gap={4} onSubmit={onSubmit} className="flex-1 mt-2">
      <RadioGroup
        id="secretKind"
        groupLabel="Number of seeds"
        value={option}
        options={[
          { text: "12 words", value: "12" },
          { text: "24 words", value: "24" },
          { text: "Private Key", value: "private-key" },
          { text: "Spending Key", value: "spending-key" },
        ]}
        onChange={onChangeOption}
      />

      <Stack
        as="ul"
        gap={1}
        className="min-h-[60px] text-[13px] list-disc px-6 text-ink-2 font-medium"
      >
        {isMnemonic && (
          <>
            <li>
              Enter your seed phrase in the right order without capitalisation,
              punctuation symbols or spaces.
            </li>
            <li>Or copy and paste your entire phrase.</li>
          </>
        )}
      </Stack>

      {/* The word grid stays under its instructions; a lone key field is
          centred in the space down to Next. */}
      <div
        className={clsx(
          "flex flex-col flex-1 gap-2.5",
          isMnemonic ? "justify-start" : "justify-center"
        )}
      >
        {mnemonicError && <Alert type="error">{mnemonicError}</Alert>}

        {isMnemonic && (
          <SeedPhraseList
            sensitive={false}
            columns={mnemonicLength === 24 ? 4 : 3}
            invalidWordIndex={invalidWordIndex}
            words={words.slice(0, mnemonicLength)}
            onChange={onWordChange}
            onPaste={onPaste}
          />
        )}

        {secretKind === "private-key" && (
          <Input
            label="Private key"
            variant="PasswordOnBlur"
            value={privateKey}
            placeholder="Enter your private key"
            onChange={(e) =>
              dispatch({ type: "setPrivateKey", value: e.target.value })
            }
            error={privateKeyError}
          />
        )}

        {secretKind === "spending-key" && (
          <Input
            label="Spending key"
            variant="PasswordOnBlur"
            value={spendingKey}
            placeholder="Enter your spending key"
            onChange={(e) =>
              dispatch({ type: "setSpendingKey", value: e.target.value })
            }
            error={spendingKeyError}
          />
        )}
      </div>

      <ActionButton
        size="lg"
        type="submit"
        data-testid="setup-import-keys-import-button"
        className="mt-auto"
        disabled={submitDisabled}
        backgroundHoverColor="black"
        textHoverColor="primary"
      >
        Next
      </ActionButton>
    </Stack>
  );
};
