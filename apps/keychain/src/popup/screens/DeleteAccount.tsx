/**
 * Delete an account after a password re-check. The background cascades to the
 * derived shielded child and repoints the active account. If no accounts
 * remain afterwards, the popup hands off to the Setup tab.
 */
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAccounts } from "../context/AccountContext";
import { useVault } from "../context/VaultContext";
import { openSetupTab } from "../openSetup";
import routes from "../routes";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Notice";
import { PasswordField } from "../ui/PasswordField";
import { ScreenHeader } from "../ui/ScreenHeader";

export const DeleteAccount = () => {
  const navigate = useNavigate();
  const { accountId = "" } = useParams<{ accountId: string }>();
  const { checkPassword } = useVault();
  const { getById, parentAccounts, remove, status } = useAccounts();

  const account = getById(accountId);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (status !== "pending" && !account && !pending) navigate(routes.accountList(), { replace: true });
  }, [account, status]);
  if (!account) return null;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(undefined);
    setPending(true);
    try {
      if (!(await checkPassword(password))) {
        setError("Incorrect password");
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
      navigate(routes.accountList(), { replace: true });
    } catch (err) {
      setError(`${err}`);
      setPending(false);
    }
  };

  return (
    <form className="flex flex-col flex-1" onSubmit={(e) => void handleSubmit(e)}>
      <ScreenHeader back title={`Remove ${account.alias}`} />
      <Notice tone="danger" title="Back up first" className="mt-3.5">
        After removal, only its seed phrase brings this account back.
        {account.type === "mnemonic" && (
          <button
            type="button"
            className="block mt-2 font-bold underline cursor-pointer"
            onClick={() => navigate(routes.viewMnemonic(accountId))}
          >
            Show seed phrase
          </button>
        )}
      </Notice>
      <div className="mt-4">
        <PasswordField
          autoFocus
          label="Password"
          value={password}
          error={error}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="mt-auto pt-4 pb-5">
        <Button type="submit" variant="danger" block disabled={pending || !password}>
          Remove account
        </Button>
      </div>
    </form>
  );
};
