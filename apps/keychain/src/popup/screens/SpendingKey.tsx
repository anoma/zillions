/**
 * Reveal a shielded account's spending keys. Gated by a password re-check; the
 * keys are fetched from the background only after the password verifies. Shows
 * both encodings: the Sapling extended spending key (Bech32
 * `secret-extended-key-main1…`, portable but Sapling-only) and the unified
 * spending key (hex, complete but non-portable), labelled "Sapling"/"Orchard".
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import type { SpendingKeys } from "../../ipc/contract";
import { useAccounts } from "../context/AccountContext";
import routes from "../routes";
import { CopyButton } from "../ui/CopyButton";
import { Notice } from "../ui/Notice";
import { PasswordGate } from "../ui/PasswordGate";
import { Eyebrow } from "../ui/Row";
import { ScreenHeader } from "../ui/ScreenHeader";

const KeyBlock = ({ label, value }: { label: string; value: string }) => (
  <>
    <div className="flex items-center justify-between">
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-3">
        <CopyButton value={value} label={`Copy ${label} key`} />
      </div>
    </div>
    <p className="m-0 rounded-xl bg-card p-3.5 font-mono text-[11px] leading-relaxed break-all select-all">
      {value}
    </p>
  </>
);

export const SpendingKey = () => {
  const navigate = useNavigate();
  const { accountId = "" } = useParams<{ accountId: string }>();
  const { getById, revealSpendingKey, status } = useAccounts();
  const [keys, setKeys] = useState<SpendingKeys>();
  const account = getById(accountId);

  useEffect(() => {
    if (status !== "pending" && !account) navigate(routes.accountList(), { replace: true });
  }, [account, status]);
  if (!account) return null;

  return (
    <>
      <ScreenHeader back title="Spending key" />
      {!keys ? (
        <PasswordGate
          what="the spending key"
          submitLabel="Show spending key"
          onVerified={async () => setKeys(await revealSpendingKey(accountId))}
        />
      ) : (
        <div className="pb-5">
          <Notice tone="danger" title="Keep this secret" className="mt-3.5">
            Anyone with a spending key can spend this account&apos;s shielded
            funds.
          </Notice>
          <KeyBlock label="Sapling" value={keys.sapling} />
          <KeyBlock label="Orchard" value={keys.orchard} />
        </div>
      )}
    </>
  );
};
