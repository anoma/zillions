/**
 * Delete an account after a password re-check. The background cascades to the
 * derived shielded child and repoints the active account. If no accounts
 * remain afterwards, the popup hands off to the Setup tab.
 */
import React, { useState } from "react";

import {
  ActionButton,
  Alert,
  GapPatterns,
  Input,
  LinkButton,
  Stack,
} from "@zillions/components";
import { useNavigate, useParams } from "react-router-dom";

import { useAccounts } from "../context/AccountContext";
import { useVault } from "../context/VaultContext";
import { openSetupTab } from "../openSetup";
import routes from "../routes";
import { PageHeader } from "../ui/PageHeader";

export const DeleteAccount = () => {
  const navigate = useNavigate();
  const { accountId = "" } = useParams<{ accountId: string }>();
  const { checkPassword } = useVault();
  const { getById, parentAccounts, remove } = useAccounts();

  const account = getById(accountId);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  if (!account) {
    navigate(routes.accountList());
    return <></>;
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      const valid = await checkPassword(password);
      if (!valid) {
        setError("Password is incorrect");
        setPending(false);
        return;
      }
      // Was this the last remaining parent account?
      const lastAccount = parentAccounts.length <= 1;
      await remove(accountId);
      if (lastAccount) {
        await openSetupTab().finally(() => window.close());
        return;
      }
      navigate(routes.accountList());
    } catch (err) {
      setError(`${err}`);
      setPending(false);
    }
  };

  return (
    <Stack as="form" onSubmit={handleSubmit} gap={GapPatterns.TitleContent} full>
      <PageHeader title="Delete Keys" />
      <Stack className="flex-1 justify-center" gap={4} full>
        <Alert type="warning" title="Alert!">
          <p className="mb-4">
            Make sure that you&apos;ve backed up your seed phrase.
          </p>
          <LinkButton
            color="primary"
            type="button"
            className="font-bold mt-4 text-sm underline"
            onClick={() => navigate(routes.viewMnemonic(accountId))}
          >
            Back Up My Wallet
          </LinkButton>
        </Alert>
        <p className="text-black leading-5 text-sm px-2 font-medium">
          After deletion, you will need to import your seed phrase to restore
          access to this account.
        </p>
        <Input
          autoFocus
          label="Password"
          variant="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
        />
      </Stack>
      <ActionButton size="md" disabled={pending || !password}>
        Delete Account
      </ActionButton>
    </Stack>
  );
};
