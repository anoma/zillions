/**
 * Display an account's viewing key (the stored UFVK). No secret reveal — the
 * viewing key is public material already held in the account record.
 */
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAccounts } from "../context/AccountContext";
import routes from "../routes";
import { CopyButton } from "../ui/CopyButton";
import { Notice } from "../ui/Notice";
import { ScreenHeader } from "../ui/ScreenHeader";

export const ViewingKey = () => {
  const navigate = useNavigate();
  const { accountId = "" } = useParams<{ accountId: string }>();
  const { getById, accounts, status } = useAccounts();
  const account = getById(accountId);

  useEffect(() => {
    if (status !== "pending" && !account) navigate(routes.accountList(), { replace: true });
  }, [account, status]);
  if (!account) return null;

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
    <>
      <ScreenHeader back title="Viewing key" />
      <Notice tone="gold" title="Share with care" className="mt-3.5">
        Anyone with this key can see this account&apos;s balances, transactions
        and messages. It can&apos;t spend.
      </Notice>
      <p className="m-0 mt-3.5 rounded-xl bg-card p-3.5 font-mono text-[11px] leading-relaxed break-all select-all">
        {viewingKey}
      </p>
      <div className="mt-auto pt-4 pb-5">
        <CopyButton
          value={viewingKey}
          className="w-full h-[38px] rounded-pill bg-black text-white text-[13px] font-semibold cursor-pointer hover:bg-black/85"
        >
          Copy viewing key
        </CopyButton>
      </div>
    </>
  );
};
