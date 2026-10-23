/**
 * "Show a payment link again" approval: the site gets the link back, and
 * whoever holds a link can claim its money. Approve → submit (background
 * opens the sealed key) + close; Reject → close, which fails the request.
 */
import { useContext } from "react";
import { useSearchParams } from "react-router-dom";

import { Alert, Stack } from "@zillions/components";

import { PageHeader } from "../../popup/ui/PageHeader";
import { ClientContext } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";
import { ApprovalActions } from "../ui/ApprovalActions";
import { SummaryCard } from "../ui/SummaryCard";
import { SummaryHeader } from "../ui/SummaryHeader";
import { SummaryRow } from "../ui/SummaryRow";

export const ApproveOpenLinkKey = () => {
  const client = useContext(ClientContext);
  const [params] = useSearchParams();
  const msgId = params.get("msgId") ?? "";
  const origin = params.get("origin") ?? "";

  const handleResponse = async (approved: boolean): Promise<void> => {
    if (approved && msgId) {
      await client?.submitOpenLinkKey(msgId);
    }
    await closeCurrentTab();
  };

  return (
    <Stack className="h-full text-black pt-4 pb-6" gap={4}>
      <PageHeader title="Show Payment Link" />
      <main className="flex flex-col flex-1 gap-4">
        <SummaryHeader label="Request">Show a payment link again</SummaryHeader>
        <SummaryCard>
          <SummaryRow label="Requested By">{origin}</SummaryRow>
        </SummaryCard>
        <Alert type="warning" title="The link is cash" className="text-xs">
          Anyone who has it can claim the money. Approve only if you are showing
          it to yourself on this site.
        </Alert>
      </main>
      <ApprovalActions
        onApprove={() => void handleResponse(true)}
        onReject={() => void handleResponse(false)}
      />
    </Stack>
  );
};
