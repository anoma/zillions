/**
 * Connection approval screen: the dapp at `interfaceOrigin` asked to connect.
 * If the origin turns out to be already approved (the popup was opened only
 * because the vault was locked), the request auto-approves after login.
 */
import { useContext, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Stack } from "@zillions/components";

import { PageHeader } from "../../popup/ui/PageHeader";
import { ClientContext, ExtensionLockContext } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";
import { ApprovalActions } from "../ui/ApprovalActions";
import { SummaryCard } from "../ui/SummaryCard";
import { SummaryHeader } from "../ui/SummaryHeader";
import { SummaryRow } from "../ui/SummaryRow";

export const ApproveConnection = () => {
  const client = useContext(ClientContext);
  const { isUnlocked } = useContext(ExtensionLockContext);
  const [params] = useSearchParams();
  const interfaceOrigin = params.get("interfaceOrigin") ?? "";
  const [isApproved, setIsApproved] = useState<boolean>();

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

  return (
    <Stack className="h-full text-black pt-4 pb-6" gap={4}>
      {typeof isApproved !== "undefined" && !isApproved && (
        <>
          <PageHeader title="Approve Request" />
          <main className="flex flex-col flex-1 gap-4">
            <SummaryHeader label="Request">Connect</SummaryHeader>
            <SummaryCard>
              <SummaryRow label="Requested By">{interfaceOrigin}</SummaryRow>
            </SummaryCard>
          </main>
          <ApprovalActions
            onApprove={() => void handleResponse(true)}
            onReject={() => void handleResponse(false)}
          />
        </>
      )}
    </Stack>
  );
};
