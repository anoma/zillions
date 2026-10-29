/**
 * Import > step 1: enter a mnemonic (12/24), private key, or spending key, or
 * choose a backup file exported from the popup's settings.
 * Mnemonic validity is checked via the typed client, which returns a structured
 * `invalidWordIndex` for highlighting.
 */
import { ActionButton, Alert, Input, RadioGroup, Stack } from "@zillions/components";
import { useCallback, useState } from "react";

import { useWizard } from "../../SetupContext";
import {
  validatePrivateKey,
  validateSpendingKey,
  type MnemonicLength,
  type SecretKind,
} from "../../model/secrets";
import { SeedPhraseList } from "../../ui/SeedPhraseList";
import { saveBackup } from "./saveBackup";

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

  const [option, setOption] = useState<Option>("12");
  const [words, setWords] = useState<string[]>(Array.from({ length: LONG }, () => ""));
  const [invalidWordIndex, setInvalidWordIndex] = useState<number>();
  const [mnemonicError, setMnemonicError] = useState<string>();
  const [backupName, setBackupName] = useState<string>();
  const [backupFile, setBackupFile] = useState("");
  const [backupPassword, setBackupPassword] = useState("");
  const [backupError, setBackupError] = useState<string>();
  const [checking, setChecking] = useState(false);

  const privateKeyError = (() => {
    const v = validatePrivateKey(privateKey);
    return v.ok ? "" : v.error;
  })();
  const spendingKeyError = (() => {
    const v = validateSpendingKey(spendingKey);
    return v.ok ? "" : v.error;
  })();

  const isMnemonic = secretKind === "mnemonic";
  const isBackup = secretKind === "backup";

  const submitDisabled =
    secretKind === "private-key" ? privateKey === "" || privateKeyError !== ""
    : secretKind === "spending-key" ? spendingKey === "" || spendingKeyError !== ""
    : isBackup ? !backupFile || !backupPassword || checking
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
        setOption("24");
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
    const opt = value as Option;
    setOption(opt);
    const { kind, length } = optionToKind(opt);
    dispatch({ type: "setSecretKind", kind });
    if (kind === "mnemonic") dispatch({ type: "setMnemonicLength", length });
    setMnemonicError(undefined);
    setInvalidWordIndex(undefined);
  };

  const onToggleBackup = (): void => {
    if (isBackup) {
      onChangeOption(option);
      return;
    }
    setMnemonicError(undefined);
    setInvalidWordIndex(undefined);
    dispatch({ type: "setSecretKind", kind: "backup" });
  };

  const onChooseBackup = async (
    e: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBackupError(undefined);
    setBackupName(file.name);
    setBackupFile(await file.text());
  };

  const onSubmitBackup = async (): Promise<void> => {
    setBackupError(undefined);
    setChecking(true);
    try {
      await client.inspectBackup(backupFile, backupPassword);
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : String(e));
      setChecking(false);
      return;
    }
    dispatch({ type: "setBackup", file: backupFile, password: backupPassword });
    if (state.passwordRequired) {
      dispatch({ type: "goToStep", step: "import.name" });
      return;
    }
    await saveBackup(client, dispatch, {
      file: backupFile,
      backupPassword,
      passwordRequired: false,
    });
  };

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (submitDisabled) return;

    if (isBackup) {
      await onSubmitBackup();
      return;
    }

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
    <>
      <Stack
        as="ul"
        gap={1}
        className="text-sm list-disc mb-5 px-6 text-black font-medium"
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
        {isBackup && (
          <>
            <li>Choose a file from Settings &gt; Export backup.</li>
            <li>
              Enter the password the Keychain had when the backup was made.
            </li>
          </>
        )}
      </Stack>
      <Stack as="form" gap={3} onSubmit={onSubmit} className="flex-1">
        <Stack direction="vertical" gap={2.5}>
          {mnemonicError && <Alert type="error">{mnemonicError}</Alert>}
          {isBackup && backupError && <Alert type="error">{backupError}</Alert>}

          {!isBackup && (
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
          )}

          {isBackup && (
            <>
              <label className="text-black text-sm font-medium">
                <span className="pl-1.5">Backup file</span>
                <span className="mt-2 flex items-center justify-between gap-4 border border-neutral-600 rounded-sm py-5 px-4 cursor-pointer text-base">
                  <span
                    className={
                      backupName ? "truncate" : "text-neutral-400 truncate"
                    }
                  >
                    {backupName ?? "No file chosen"}
                  </span>
                  <span className="shrink-0 text-sm font-semibold underline">
                    Choose file
                  </span>
                </span>
                <input
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  data-testid="setup-import-backup-file-input"
                  onChange={(e) => void onChooseBackup(e)}
                />
              </label>
              <Input
                label="Backup password"
                variant="Password"
                value={backupPassword}
                placeholder="The password it was exported with"
                onChange={(e) => setBackupPassword(e.target.value)}
              />
            </>
          )}

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
        </Stack>

        <button
          type="button"
          className="mx-auto mt-4 mb-4 text-xs font-medium text-black underline underline-offset-4 cursor-pointer transition-colors hover:text-neutral-hover"
          data-testid="setup-import-backup-toggle"
          onClick={onToggleBackup}
        >
          {isBackup ? "Enter a seed phrase or key instead" : "Restore from a backup file"}
        </button>

        <ActionButton
          size="lg"
          type="submit"
          data-testid="setup-import-keys-import-button"
          disabled={submitDisabled}
          backgroundHoverColor="black"
          textHoverColor="primary"
        >
          {checking ? "Checking…" : "Next"}
        </ActionButton>
      </Stack>
    </>
  );
};
