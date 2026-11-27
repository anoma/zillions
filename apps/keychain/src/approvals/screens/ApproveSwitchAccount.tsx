/**
 * Account switch screen: the connected dapp asked the user to pick the
 * account it uses. The site never sees the list; it learns only the account
 * picked here. Warns when that shares an account the site hasn't seen.
 * Switch → submit (background moves the site and the active account) + close;
 * Reject → fail the dapp promise + close.
 */
import { useContext, useState } from "react";
import { GoCheck } from "react-icons/go";
import { useSearchParams } from "react-router-dom";

import { Avatar, siteHost } from "../../popup/ui/Avatar";
import { Notice } from "../../popup/ui/Notice";
import { Eyebrow, Row } from "../../popup/ui/Row";
import { ScreenHeader } from "../../popup/ui/ScreenHeader";
import { Tag } from "../../popup/ui/Tag";
import { ClientContext } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";
import { DecisionBar } from "../ui/DecisionBar";
import { RequestCard } from "../ui/RequestCard";
import { useWallets } from "../ui/useWallets";

export const ApproveSwitchAccount = () => {
  const client = useContext(ClientContext);
  const [params] = useSearchParams();
  const origin = params.get("origin") ?? "";
  const current = params.get("current") ?? "";
  const shared = (params.get("shared") ?? "").split(",");
  const { wallets } = useWallets();
  const [chosenId, setChosenId] = useState(current);
  const chosen = wallets.find((w) => w.id === chosenId);

  const handleResponse = async (approved: boolean): Promise<void> => {
    if (approved && chosen) {
      await client?.submitSwitchAccount(chosen.id);
    }
    await closeCurrentTab();
  };

  return (
    <>
      <ScreenHeader title="Switch account" />
      {origin && <RequestCard origin={origin} />}
      <Eyebrow>Account</Eyebrow>
      {wallets.map((wallet) => (
        <Row
          key={wallet.id}
          lead={<Avatar accountId={wallet.id} alias={wallet.alias} />}
          title={wallet.alias}
          subtitle={wallet.id === current ? "In use on this site" : undefined}
          trail={
            wallet.id === chosenId ? (
              <GoCheck className="size-4 shrink-0 text-gold" />
            ) : (
              <Tag>Use</Tag>
            )
          }
          onClick={() => setChosenId(wallet.id)}
        />
      ))}
      {chosen && !shared.includes(chosen.id) && (
        <Notice tone="gold" title="Shares this account" className="mt-4">
          {siteHost(origin)} will see {chosen.alias}&apos;s balance and full
          history, past and future, and can ask you to approve payments from
          it. Disconnecting later won&apos;t undo this.
        </Notice>
      )}
      <DecisionBar
        approveLabel="Switch"
        approveDisabled={!chosen || chosen.id === current}
        onApprove={() => handleResponse(true)}
        onReject={() => handleResponse(false)}
      />
    </>
  );
};
