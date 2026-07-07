/**
 * Rename an account (and, in the background, its derived children). No password
 * gate — renaming exposes no secrets.
 */
import React, { useState } from "react";

import { ActionButton, GapPatterns, Input, Stack } from "@zillions/components";
import { useNavigate, useParams } from "react-router-dom";

import { useAccounts } from "../context/AccountContext";
import routes from "../routes";
import { PageHeader } from "../ui/PageHeader";

export const RenameAccount = () => {
  const navigate = useNavigate();
  const { accountId = "" } = useParams<{ accountId: string }>();
  const { getById, rename } = useAccounts();

  const account = getById(accountId);
  const [alias, setAlias] = useState("");
  const [error, setError] = useState("");

  if (!account) {
    navigate(routes.accountList());
    return <></>;
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError("");
    try {
      await rename(accountId, alias);
      navigate(routes.viewAccount(accountId));
    } catch (err) {
      setError(`${err}`);
    }
  };

  return (
    <Stack as="form" gap={GapPatterns.TitleContent} onSubmit={handleSubmit} full>
      <PageHeader title="Rename Key" />
      <Stack className="flex-1 justify-center" full gap={GapPatterns.FormFields}>
        <Input readOnly label="Current name" value={account.alias} />
        <Input
          autoFocus
          label="New name"
          placeholder="Ex: Special Account"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          error={error}
        />
      </Stack>
      <ActionButton size="md" disabled={!alias}>
        Rename
      </ActionButton>
    </Stack>
  );
};
