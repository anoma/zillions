/**
 * Edit an account: its name (renamed in the background, children included)
 * and its colour. No password gate — neither exposes a secret.
 */
import clsx from "clsx";
import React, { useEffect, useState } from "react";
import { GoCheck } from "react-icons/go";
import { useNavigate, useParams } from "react-router-dom";

import type { StoredAccount } from "../../ipc/contract";
import { useAccounts } from "../context/AccountContext";
import { ACCOUNT_COLORS, accountColor, setAccountColor } from "../prefs";
import routes from "../routes";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { TextField } from "../ui/PasswordField";
import { Eyebrow } from "../ui/Row";
import { ScreenHeader } from "../ui/ScreenHeader";
import { useBack } from "../ui/useBack";

export const RenameAccount = () => {
  const navigate = useNavigate();
  const { accountId = "" } = useParams<{ accountId: string }>();
  const { getById, status } = useAccounts();
  const account = getById(accountId);

  useEffect(() => {
    if (status !== "pending" && !account) navigate(routes.accountList(), { replace: true });
  }, [account, status]);
  // The form starts from the stored name, so it waits for the account.
  return account ? <EditForm account={account} /> : null;
};

const EditForm = ({ account }: { account: StoredAccount }) => {
  const back = useBack();
  const { rename } = useAccounts();
  const accountId = account.id;
  const [alias, setAlias] = useState(account.alias);
  const [color, setColor] = useState(() => accountColor(accountId));
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const name = alias.trim();

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(undefined);
    setPending(true);
    try {
      if (name !== account.alias) await rename(accountId, name);
      setAccountColor(accountId, color);
      back();
    } catch (err) {
      setError(`${err}`);
      setPending(false);
    }
  };

  return (
    <form className="flex flex-col flex-1" onSubmit={(e) => void handleSubmit(e)}>
      <ScreenHeader back title="Edit account" />
      <div className="flex justify-center pt-3 pb-2">
        <Avatar accountId={accountId} alias={name || account.alias} size="lg" color={color} />
      </div>
      <TextField
        autoFocus
        label="Name"
        value={alias}
        maxLength={40}
        error={error}
        onChange={(e) => setAlias(e.target.value)}
      />
      <Eyebrow>Colour</Eyebrow>
      <div role="radiogroup" aria-label="Colour" className="flex gap-2.5">
        {ACCOUNT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c === color}
            aria-label={c}
            onClick={() => setColor(c)}
            className={clsx(
              "size-8 rounded-pill grid place-items-center text-[#111] cursor-pointer transition-shadow",
              c === color && "shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-black)]"
            )}
            style={{ backgroundColor: c }}
          >
            {c === color && <GoCheck className="size-4" />}
          </button>
        ))}
      </div>
      <div className="mt-auto pt-4 pb-5">
        <Button type="submit" block disabled={!name || pending}>
          Save
        </Button>
      </div>
    </form>
  );
};
