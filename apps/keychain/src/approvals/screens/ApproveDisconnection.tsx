/**
 * Disconnection approval screen: the dapp at `interfaceOrigin` asked to
 * disconnect (revoke its approval).
 */
import { useContext } from "react";
import { useSearchParams } from "react-router-dom";

import { Stack } from "@zillions/components";

import { PageHeader } from "../../popup/ui/PageHeader";
import { ClientContext } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";
import { ApprovalActions } from "../ui/ApprovalActions";
import { SummaryCard } from "../ui/SummaryCard";
import { SummaryHeader } from "../ui/SummaryHeader";
import { SummaryRow } from "../ui/SummaryRow";

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
    <Stack className="h-full text-black pt-4 pb-6" gap={4}>
      <PageHeader title="Approve Request" />
      <main className="flex flex-col flex-1 gap-4">
        <SummaryHeader label="Request">Disconnect</SummaryHeader>
        <SummaryCard>
          <SummaryRow label="Requested By">{interfaceOrigin}</SummaryRow>
        </SummaryCard>
      </main>
      <ApprovalActions
        onApprove={() => void handleResponse(true)}
        onReject={() => void handleResponse(false)}
      />
    </Stack>
  );
};
