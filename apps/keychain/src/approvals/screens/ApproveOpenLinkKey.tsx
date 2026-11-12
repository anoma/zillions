/**
 * "Show a payment link again" approval: the site gets the link back, and
 * whoever holds a link can claim its money. Asks for the password every time,
 * as signing does. Approve → submit (background checks the password, opens
 * the sealed key) + close; Reject → close, which fails the request.
 */
import { useContext, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { siteHost } from "../../popup/ui/Avatar";
import { Notice } from "../../popup/ui/Notice";
import { PasswordField } from "../../popup/ui/PasswordField";
import { ScreenHeader } from "../../popup/ui/ScreenHeader";
import { ClientContext } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";
import { DecisionBar } from "../ui/DecisionBar";
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
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();

  const show = async (): Promise<void> => {
    try {
      await client?.submitOpenLinkKey(msgId, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    await closeCurrentTab();
  };

  return (
    <>
      <ScreenHeader title="Show payment link" />
      <RequestCard origin={origin} accountLabel="Link from" account={walletFor(accounts, signer)} />
      <Notice tone="gold" title="The link is cash" className="mt-4">
        {siteHost(origin)} will get this link&apos;s key, and anyone who has it
        can claim the money. Approve only if you are showing it to yourself
        here.
      </Notice>
      <div className="mt-4">
        <PasswordField
          label="Password"
          value={password}
          error={error}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(undefined);
          }}
        />
      </div>
      <DecisionBar
        approveLabel="Show link"
        approveDisabled={!password || !msgId}
        onApprove={show}
        onReject={closeCurrentTab}
      />
    </>
  );
};
