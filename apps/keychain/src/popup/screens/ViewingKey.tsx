/**
 * Display an account's viewing key (the stored UFVK). No secret reveal — the
 * viewing key is public material already held in the account record.
 */
import { GapPatterns, Input, Stack } from "@zillions/components";
import { useNavigate, useParams } from "react-router-dom";

import { useAccounts } from "../context/AccountContext";
import routes from "../routes";
import { BackButton } from "../ui/BackButton";
import { PageHeader } from "../ui/PageHeader";

export const ViewingKey = (): JSX.Element => {
  const navigate = useNavigate();
  const { accountId = "" } = useParams<{ accountId: string }>();
  const { getById, accounts } = useAccounts();

  const account = getById(accountId);
  if (!account) {
    navigate(routes.accountList());
    return <></>;
  }

  // The UFVK (viewing key) lives on the SHIELDED account's `owner`: a
  // spending-key import is itself shielded; otherwise it's the shielded child
  // derived under this (mnemonic/transparent) parent.
  const shielded =
    account.type === "shielded-keys"
      ? account
      : accounts.find(
          (a) => a.parentId === account.id && a.type === "shielded-keys"
        );
  const viewingKey = shielded?.owner ?? "";

  return (
    <Stack full gap={GapPatterns.TitleContent}>
      <Stack full gap={GapPatterns.FormFields}>
        <PageHeader title="Viewing Key" />
        <p className="text-black">
          Your viewing key grants the holder the ability to see all your
          balances and transaction data. Please keep it secure to protect your
          data.
        </p>
        <Input
          label="Viewing Key"
          variant="ReadOnlyCopyText"
          readOnly
          rows={10}
          valueToDisplay={viewingKey}
          value={viewingKey}
          className="pb-20 [&_textarea]:py-2"
        />
      </Stack>
      <BackButton onClick={() => navigate(-1)} />
    </Stack>
  );
};
