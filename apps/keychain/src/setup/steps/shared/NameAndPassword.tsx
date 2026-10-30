/**
 * Shared step: name the account (and set a password if none exists yet), then
 * kick off persistence and advance to the completion step.
 *
 * This is where the wizard hands off to the `accountManager` orchestration —
 * the UI dispatches progress events but does not contain the sequencing logic.
 */
import { ActionButton, GapPatterns, Input, Stack } from "@zillions/components";
import { useState } from "react";

import { useWizard } from "../../SetupContext";
import { createAccount } from "../../model/accountManager";
import { toAccountSecret } from "../../model/secrets";
import type { Step } from "../../model/wizard";
import { saveDevice } from "../device/saveDevice";
import { PasswordFields } from "../../ui/PasswordFields";
import { saveBackup } from "../import/saveBackup";

type Props = {
  /** Where to go once persistence starts (the completion step of the branch). */
  nextStep: Extract<
    Step,
    "create.complete" | "import.complete" | "device.complete"
  >;
};

export const NameAndPassword = ({ nextStep }: Props) => {
  const { state, dispatch, client } = useWizard();
  const [alias, setAlias] = useState(state.alias);
  const [aliasError, setAliasError] = useState("");
  const [password, setPassword] = useState<string | undefined>(state.password);
  const [submitting, setSubmitting] = useState(false);

  // A backup brings its accounts' names.
  const isBackup = state.secretKind === "backup";
  const invalid =
    (!isBackup && !alias) ||
    (state.passwordRequired && !password) ||
    submitting;

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (invalid) return;
    setSubmitting(true);

    if (state.secretKind === "backup") {
      await saveBackup(client, dispatch, {
        file: state.backupFile,
        backupPassword: state.backupPassword,
        passwordRequired: state.passwordRequired,
        password,
      });
      return;
    }

    dispatch({ type: "setAlias", alias });
    dispatch({ type: "setPassword", password });

    // A device account skips the seed derivation: its keys come from the
    // device, the orchestration is saveDevice's.
    if (state.flow === "device") {
      await saveDevice(client, dispatch, {
        device: state.deviceKind!,
        keys: state.deviceKeys!,
        passwordRequired: state.passwordRequired,
        password,
      });
      return;
    }

    dispatch({ type: "goToStep", step: nextStep });
    dispatch({ type: "completionStarted", info: "Starting…" });

    const result = await createAccount(
      client,
      {
        accountSecret: toAccountSecret({
          kind: state.secretKind,
          mnemonic: state.mnemonic,
          mnemonicLength: state.mnemonicLength,
          privateKey: state.privateKey,
          spendingKey: state.spendingKey,
          passphrase: state.bip39Passphrase,
        }),
        alias,
        flow: state.flow === "import" ? "import" : "create",
        bip44Path: state.bip44Path,
        zip32Path: state.zip32Path,
        passwordRequired: state.passwordRequired,
        password,
      },
      (info) => dispatch({ type: "completionInfo", info })
    );

    if (result.ok) {
      dispatch({
        type: "completionSucceeded",
        parentAccount: result.parentAccount,
        shieldedAccount: result.shieldedAccount,
      });
    } else {
      dispatch({ type: "completionFailed", info: result.error });
    }
  };

  return (
    <Stack
      as="form"
      gap={1}
      onSubmit={onSubmit}
      className="justify-between flex-1"
    >
      <Stack gap={GapPatterns.FormFields} className="justify-center flex-1">
        {!isBackup && (
          <Input
            data-testid="setup-seed-phrase-alias-input"
            label="Keys Name"
            placeholder="e.g Zillions Shielded Wallet"
            value={alias}
            error={aliasError}
            onChange={(e) => setAlias(e.target.value)}
            onBlur={() => setAliasError(alias === "" ? "Required field" : "")}
          />
        )}
        {state.passwordRequired && (
          <Stack gap={GapPatterns.FormFields}>
            <PasswordFields onValidPassword={setPassword} />
          </Stack>
        )}
      </Stack>
      <ActionButton
        size="lg"
        type="submit"
        data-testid="setup-seed-phrase-verification-next-btn"
        disabled={invalid}
        backgroundHoverColor="black"
        textHoverColor="primary"
        className="mt-8"
      >
        Next
      </ActionButton>
    </Stack>
  );
};
