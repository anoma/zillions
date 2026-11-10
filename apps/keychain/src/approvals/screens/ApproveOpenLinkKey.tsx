/**
 * "Show a payment link again" approval: the site gets the link back, and
 * whoever holds a link can claim its money. Approve → submit (background
 * opens the sealed key) + close; Reject → close, which fails the request.
 */
import { useContext } from "react";
import { useSearchParams } from "react-router-dom";

import { Notice } from "../../popup/ui/Notice";
import { ScreenHeader } from "../../popup/ui/ScreenHeader";
import { ClientContext } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";
import { DecisionBar } from "../ui/DecisionBar";
import { RequestCard } from "../ui/RequestCard";
import { useWallets } from "../ui/useWallets";

export const ApproveOpenLinkKey = () => {
  const client = useContext(ClientContext);
  const [params] = useSearchParams();
  const msgId = params.get("msgId") ?? "";
  const origin = params.get("origin") ?? "";
  const { active } = useWallets();

  const handleResponse = async (approved: boolean): Promise<void> => {
    if (approved && msgId) {
      await client?.submitOpenLinkKey(msgId);
    }
    await closeCurrentTab();
  };

  return (
    <>
      <ScreenHeader title="Show payment link" />
      <RequestCard origin={origin} accountLabel="Link from" account={active} />
      <Notice tone="gold" title="The link is cash" className="mt-4">
        Anyone who has it can claim the money. Approve only if you are showing
        it to yourself on this site.
      </Notice>
      <DecisionBar
        approveLabel="Show link"
        onApprove={() => handleResponse(true)}
        onReject={() => handleResponse(false)}
      />
    </>
  );
};
