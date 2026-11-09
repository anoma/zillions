/**
 * Connection approval screen: the dapp at `interfaceOrigin` asked to connect.
 * Says what a connected site can see and do, and which account it will see
 * first (switchable here). If the origin turns out to be already approved
 * (the popup was opened only because the vault was locked), the request
 * auto-approves after login.
 */
import { useContext, useEffect, useState } from "react";
import { GoCheck, GoX } from "react-icons/go";
import { useSearchParams } from "react-router-dom";

import { Avatar, siteHost, SiteIcon } from "../../popup/ui/Avatar";
import { Eyebrow, Row } from "../../popup/ui/Row";
import { ScreenHeader } from "../../popup/ui/ScreenHeader";
import { Tag } from "../../popup/ui/Tag";
import { ClientContext, ExtensionLockContext } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";
import { GuardedButton, DecisionBar } from "../ui/DecisionBar";
import { useWallets } from "../ui/useWallets";

const Ability = ({ allowed, children }: { allowed: boolean; children: React.ReactNode }) => (
  <li className="flex items-center gap-3 py-2 border-b border-line last:border-b-0 text-[12.5px] font-medium">
    {allowed ? (
      <GoCheck className="size-4 shrink-0 text-muted" />
    ) : (
      <GoX className="size-4 shrink-0 text-muted" />
    )}
    {children}
  </li>
);

export const ApproveConnection = () => {
  const client = useContext(ClientContext);
  const { isUnlocked } = useContext(ExtensionLockContext);
  const [params] = useSearchParams();
  const interfaceOrigin = params.get("interfaceOrigin") ?? "";
  const [isApproved, setIsApproved] = useState<boolean>();
  const [picking, setPicking] = useState(false);
  const { wallets, active, setActive } = useWallets(isUnlocked);

  const handleResponse = async (allowConnection: boolean): Promise<void> => {
    await client?.resolveConnection(interfaceOrigin, allowConnection);
    await closeCurrentTab();
  };

  useEffect(() => {
    if (!isUnlocked || !client) return;
    // The origin may already be approved (popup opened as a login gate only) —
    // connect without asking again.
    client
      .isConnectionApproved(interfaceOrigin)
      .then((approved) => {
        setIsApproved(approved);
        if (approved) {
          void handleResponse(true);
        }
      })
      .catch(console.error);
  }, [isUnlocked]);

  if (isApproved !== false) return null;

  return (
    <>
      <ScreenHeader title="Connect" />
      <section className="flex flex-col items-center gap-2 pt-6 pb-1 text-center">
        <SiteIcon origin={interfaceOrigin} size="lg" />
        <p className="m-0 mt-1 text-base font-semibold" title={interfaceOrigin}>
          {siteHost(interfaceOrigin)}
        </p>
        <p className="m-0 text-xs text-muted">wants to connect to your Keychain</p>
      </section>

      <Eyebrow>It will be able to</Eyebrow>
      <ul className="m-0 p-0 list-none">
        <Ability allowed>See your account names and addresses</Ability>
        <Ability allowed>See the active account&apos;s balance and history</Ability>
        <Ability allowed>Ask you to approve transactions</Ability>
        <Ability allowed={false}>Spend without your approval</Ability>
      </ul>

      <Eyebrow>Active account</Eyebrow>
      {active && (
        <Row
          lead={<Avatar accountId={active.id} alias={active.alias} />}
          title={active.alias}
          trail={
            wallets.length > 1 && (
              <GuardedButton variant="secondary" size="sm" onPress={() => setPicking(!picking)}>
                {picking ? "Done" : "Change"}
              </GuardedButton>
            )
          }
        />
      )}
      {picking &&
        wallets
          .filter((w) => w.id !== active?.id)
          .map((wallet) => (
            <Row
              key={wallet.id}
              className="animate-fade-in"
              lead={<Avatar accountId={wallet.id} alias={wallet.alias} />}
              title={wallet.alias}
              trail={<Tag>Use</Tag>}
              onClick={() => {
                void setActive(wallet);
                setPicking(false);
              }}
            />
          ))}

      <DecisionBar
        approveLabel="Connect"
        onApprove={() => handleResponse(true)}
        onReject={() => handleResponse(false)}
      />
    </>
  );
};
