/**
 * Default-account approval screen: the connected dapp asked to make `address`
 * the active/default account. Approve → submit (background sets the active
 * account) + close; Reject → fail the dapp promise + close.
 */
import { useContext } from "react";
import { useSearchParams } from "react-router-dom";

import { shortenAddress } from "@zillions/utils";

import { Avatar } from "../../popup/ui/Avatar";
import { ActionBar, Button } from "../../popup/ui/Button";
import { Eyebrow, Row } from "../../popup/ui/Row";
import { ScreenHeader } from "../../popup/ui/ScreenHeader";
import { ClientContext } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";
import { RequestCard } from "../ui/RequestCard";
import { useWallets } from "../ui/useWallets";
import { walletFor } from "../utils/accounts";

export const ApproveUpdateDefaultAccount = () => {
  const client = useContext(ClientContext);
  const [params] = useSearchParams();
  const address = params.get("address") ?? "";
  const alias = params.get("alias") ?? "";
  const origin = params.get("origin") ?? "";
  const { accounts, active } = useWallets();
  const next = walletFor(accounts, address);

  const handleResponse = async (approved: boolean): Promise<void> => {
    if (approved && address) {
      await client?.submitUpdateDefaultAccount(address);
    }
    await closeCurrentTab();
  };

  return (
    <>
      <ScreenHeader title="Change active account" />
      {origin && <RequestCard origin={origin} />}
      {active && (
        <>
          <Eyebrow>From</Eyebrow>
          <Row
            lead={<Avatar accountId={active.id} alias={active.alias} />}
            title={active.alias}
          />
        </>
      )}
      <Eyebrow>To</Eyebrow>
      <Row
        lead={next && <Avatar accountId={next.id} alias={next.alias} />}
        title={alias}
        subtitle={<span className="font-mono text-[11px]">{shortenAddress(address, 8, 8, "…")}</span>}
      />
      <ActionBar>
        <Button variant="secondary" onClick={() => void handleResponse(false)}>
          Reject
        </Button>
        <Button onClick={() => void handleResponse(true)}>Switch</Button>
      </ActionBar>
    </>
  );
};
