/**
 * Reveal a mnemonic account's seed phrase. Gated by a password re-check; the
 * phrase is fetched from the background only after the password verifies,
 * and hidden again after a minute.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useAccounts } from "../context/AccountContext";
import routes from "../routes";
import { Button } from "../ui/Button";
import { Notice } from "../ui/Notice";
import { PasswordGate } from "../ui/PasswordGate";
import { ScreenHeader } from "../ui/ScreenHeader";

const SHOWN_FOR_S = 60;

const formatCountdown = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export const ViewMnemonic = () => {
  const navigate = useNavigate();
  const { accountId = "" } = useParams<{ accountId: string }>();
  const { getById, revealMnemonic, status } = useAccounts();
  const [mnemonic, setMnemonic] = useState<string>();
  const [secondsLeft, setSecondsLeft] = useState(SHOWN_FOR_S);
  const account = getById(accountId);

  useEffect(() => {
    if (status !== "pending" && !account) navigate(routes.accountList(), { replace: true });
  }, [account, status]);

  useEffect(() => {
    if (mnemonic === undefined) return;
    setSecondsLeft(SHOWN_FOR_S);
    const timer = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [mnemonic]);

  useEffect(() => {
    if (secondsLeft <= 0) setMnemonic(undefined);
  }, [secondsLeft]);

  if (!account) return null;
  const words = mnemonic?.split(" ") ?? [];

  return (
    <>
      <ScreenHeader back title="Seed phrase" />
      {mnemonic === undefined ? (
        <PasswordGate
          what="the seed phrase"
          submitLabel="Show seed phrase"
          onVerified={async () => setMnemonic((await revealMnemonic(accountId)) || "")}
        />
      ) : (
        <>
          <Notice tone="danger" title="Never share these words" className="mt-3.5">
            Anyone with them controls this account. Zillions will never ask for
            them. Write them on paper: a copy or screenshot can be read by other
            apps and synced backups.
          </Notice>
          <ol className="m-0 mt-3.5 grid grid-cols-3 gap-x-2.5 gap-y-1.5 rounded-xl bg-card p-3.5 list-none">
            {words.map((word, i) => (
              <li key={i} className="text-xs font-medium">
                <span className="inline-block w-[18px] text-[10.5px] text-muted">{i + 1}</span>
                {word}
              </li>
            ))}
          </ol>
          <p className="m-0 mt-3 text-center text-[11px] text-muted tabular-nums">
            Hidden again in {formatCountdown(secondsLeft)}
          </p>
          <div className="mt-auto flex flex-col gap-2 pt-4 pb-5">
            <Button variant="secondary" block onClick={() => setMnemonic(undefined)}>
              Hide now
            </Button>
          </div>
        </>
      )}
    </>
  );
};
