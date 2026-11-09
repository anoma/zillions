/**
 * Disconnection approval screen: the dapp at `interfaceOrigin` asked to
 * disconnect (revoke its approval).
 */
import { useContext } from "react";
import { useSearchParams } from "react-router-dom";

import { Notice } from "../../popup/ui/Notice";
import { ScreenHeader } from "../../popup/ui/ScreenHeader";
import { ClientContext } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";
import { DecisionBar } from "../ui/DecisionBar";
import { RequestCard } from "../ui/RequestCard";

export const ApproveDisconnection = () => {
  const client = useContext(ClientContext);
  const [params] = useSearchParams();
  const interfaceOrigin = params.get("interfaceOrigin") ?? "";

  const handleResponse = async (revokeConnection: boolean): Promise<void> => {
    if (interfaceOrigin) {
      await client?.resolveDisconnection(interfaceOrigin, revokeConnection);
      await closeCurrentTab();
    }
  };

  return (
    <>
      <ScreenHeader title="Disconnect" />
      <RequestCard origin={interfaceOrigin} />
      <Notice tone="neutral" className="mt-4">
        The site asks to disconnect. It will no longer see your accounts until
        you connect it again.
      </Notice>
      <DecisionBar
        rejectLabel="Keep connected"
        approveLabel="Disconnect"
        onApprove={() => handleResponse(true)}
        onReject={() => handleResponse(false)}
      />
    </>
  );
};
