/**
 * Reveal a shielded account's spending keys. Gated by a password re-check; the
 * keys are fetched from the background only after the password verifies. Shows
 * both encodings: the Sapling extended spending key (Bech32
 * `secret-extended-key-main1…`, portable but Sapling-only) and the unified
 * spending key (hex, complete but non-portable), labelled "Sapling"/"Orchard".
 */
import React, { useState } from "react";

import {
  ActionButton,
  Alert,
  GapPatterns,
  Input,
  Stack,
} from "@zillions/components";
import { useNavigate, useParams } from "react-router-dom";

import type { SpendingKeys } from "../../ipc/contract";
import { useAccounts } from "../context/AccountContext";
import { useVault } from "../context/VaultContext";
import routes from "../routes";
import { BackButton } from "../ui/BackButton";
import { PageHeader } from "../ui/PageHeader";

export const SpendingKey = () => {
  const navigate = useNavigate();
  const { accountId = "" } = useParams<{ accountId: string }>();
  const { checkPassword } = useVault();
  const { getById, revealSpendingKey } = useAccounts();

  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [keys, setKeys] = useState<SpendingKeys | undefined>();

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
      setKeys(await revealSpendingKey(accountId));
    } catch (err) {
      setPasswordError(`${err}`);
    }
  };

  return (
    <Stack full as="form" gap={GapPatterns.TitleContent} onSubmit={handleSubmit}>
      <PageHeader title="Spending Key" />
      {!keys && (
        <>
          <Stack className="mt-12" full gap={GapPatterns.FormFields}>
            <Alert type="info">
              Please provide your password in order to view your spending key
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

      {keys && (
        <>
          <Stack className="flex-1" full gap={GapPatterns.FormFields}>
            <p className="text-black">
              Your spending key grants the holder the ability to spend funds
              from your shielded account. This must be kept secret!
            </p>
            <Input
              label="Sapling"
              variant="ReadOnlyCopyText"
              readOnly
              rows={5}
              valueToDisplay={keys.sapling}
              value={keys.sapling}
              sensitive
              className="[&_textarea]:py-2"
            />
            <Input
              label="Orchard"
              variant="ReadOnlyCopyText"
              readOnly
              rows={5}
              valueToDisplay={keys.orchard}
              value={keys.orchard}
              sensitive
              className="[&_textarea]:py-2"
            />
          </Stack>
          <BackButton onClick={() => navigate(-1)} />
        </>
      )}
    </Stack>
  );
};
