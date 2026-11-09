/**
 * "Show a payment link again" approval: the site gets the link back, and
 * whoever holds a link can claim its money. Approve → submit (background
 * opens the sealed key) + close; Reject → close, which fails the request.
 */
import { useContext } from "react";
import { useSearchParams } from "react-router-dom";

import { ActionBar, Button } from "../../popup/ui/Button";
import { Notice } from "../../popup/ui/Notice";
import { ScreenHeader } from "../../popup/ui/ScreenHeader";
import { ClientContext } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";
import { RequestCard } from "../ui/RequestCard";
import { useWallets } from "../ui/useWallets";
import { walletFor } from "../utils/accounts";

export const ApproveOpenLinkKey = () => {
  const client = useContext(ClientContext);
  const [params] = useSearchParams();
  const msgId = params.get("msgId") ?? "";
  const origin = params.get("origin") ?? "";
  const signer = params.get("signer") ?? "";
  const { accounts } = useWallets();

  const handleResponse = async (approved: boolean): Promise<void> => {
    if (approved && msgId) {
      await client?.submitOpenLinkKey(msgId);
    }
    await closeCurrentTab();
  };

  return (
    <>
      <ScreenHeader title="Show payment link" />
      <RequestCard origin={origin} accountLabel="Link from" account={walletFor(accounts, signer)} />
      <Notice tone="gold" title="The link is cash" className="mt-4">
        Anyone who has it can claim the money. Approve only if you are showing
        it to yourself on this site.
      </Notice>
      <ActionBar>
        <Button variant="secondary" onClick={() => void handleResponse(false)}>
          Reject
        </Button>
        <Button onClick={() => void handleResponse(true)}>Show link</Button>
      </ActionBar>
    </>
  );
};
