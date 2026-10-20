/**
 * Ledger > first-run only: set the extension password, then store the Ledger.
 */
import { ActionButton, GapPatterns, Stack } from "@zillions/components";
import { useState } from "react";

import { useWizard } from "../../SetupContext";
import { PasswordFields } from "../../ui/PasswordFields";
import { saveLedger } from "./saveLedger";

export const LedgerPassword = () => {
  const { state, dispatch, client } = useWizard();
  const [password, setPassword] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const invalid = !password || !state.ledgerKeys || submitting;

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (invalid) return;
    setSubmitting(true);
    await saveLedger(client, dispatch, {
      keys: state.ledgerKeys!,
      passwordRequired: true,
      password,
    });
  };

  return (
    <Stack
      as="form"
      gap={1}
      onSubmit={onSubmit}
      className="justify-between flex-1"
    >
      <Stack gap={GapPatterns.FormFields} className="justify-center flex-1">
        <PasswordFields onValidPassword={setPassword} />
      </Stack>
      <ActionButton
        size="lg"
        type="submit"
        data-testid="setup-ledger-password-next-btn"
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
