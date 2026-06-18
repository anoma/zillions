/**
 * Reveal a mnemonic account's seed phrase. Gated by a password re-check; the
 * phrase is fetched from the background only after the password verifies.
 */
import React, { useState } from "react";

import {
  ActionButton,
  Alert,
  GapPatterns,
  Input,
  SeedPhraseInstructions,
  Stack,
} from "@zillions/components";
import { useNavigate, useParams } from "react-router-dom";

import { useAccounts } from "../context/AccountContext";
import { useVault } from "../context/VaultContext";
import routes from "../routes";
import { BackButton } from "../ui/BackButton";
import { PageHeader } from "../ui/PageHeader";

export const ViewMnemonic = (): JSX.Element => {
  const navigate = useNavigate();
  const { accountId = "" } = useParams<{ accountId: string }>();
  const { checkPassword } = useVault();
  const { getById, revealMnemonic } = useAccounts();

  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [mnemonic, setMnemonic] = useState<string | undefined>();

  if (!getById(accountId)) {
    navigate(routes.accountList());
    return <></>;
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setPasswordError("");
    try {
      const valid = await checkPassword(password);
      if (!valid) {
        setPasswordError("Invalid password");
        return;
      }
      setMnemonic((await revealMnemonic(accountId)) || "");
    } catch (err) {
      setPasswordError(`${err}`);
    }
  };

  const revealed = mnemonic !== undefined;

  return (
    <Stack full as="form" gap={4} onSubmit={handleSubmit}>
      <PageHeader title="View Seed Phrase" />

      {!revealed && (
        <>
          <Stack className="mt-12" full gap={GapPatterns.FormFields}>
            <Alert type="info">
              Please provide your password in order to view your seed phrase
            </Alert>
            <Input
              autoFocus
              variant="Password"
              label="Password"
              placeholder="Password"
              error={passwordError}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Stack>
          <ActionButton type="submit" size="md" disabled={!password}>
            Proceed
          </ActionButton>
        </>
      )}

      {revealed && (
        <>
          <Stack className="flex-1 justify-center" full gap={1}>
            <div className="text-sm">
              <SeedPhraseInstructions />
            </div>
            <Input
              variant="Textarea"
              readOnly
              value={mnemonic}
              sensitive
              className="mt-6 [&_textarea]:rounded-lg [&_textarea]:py-8 [&_textarea]:px-6"
              rows={mnemonic.split(" ").length === 24 ? 5 : 3}
            />
          </Stack>
          <BackButton onClick={() => navigate(-1)} />
        </>
      )}
    </Stack>
  );
};
