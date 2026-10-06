/**
 * Default-account approval screen: the connected dapp asked to make `address`
 * the active/default account. Approve → submit (background sets the active
 * account) + close; Reject → fail the dapp promise + close.
 */
import { useContext } from "react";
import { useSearchParams } from "react-router-dom";

import { Stack } from "@zillions/components";
import { shortenAddress } from "@zillions/utils";

import { PageHeader } from "../../popup/ui/PageHeader";
import { ClientContext } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";
import { ApprovalActions } from "../ui/ApprovalActions";
import { SummaryCard } from "../ui/SummaryCard";
import { SummaryHeader } from "../ui/SummaryHeader";
import { SummaryRow } from "../ui/SummaryRow";

export const ApproveUpdateDefaultAccount = () => {
  const client = useContext(ClientContext);
  const [params] = useSearchParams();
  const address = params.get("address") ?? "";
  const alias = params.get("alias") ?? "";

  const handleResponse = async (approved: boolean): Promise<void> => {
    if (approved && address) {
      await client?.submitUpdateDefaultAccount(address);
    }
    await closeCurrentTab();
  };

  return (
    <Stack className="h-full text-black pt-4 pb-6" gap={4}>
      <PageHeader title="Approve Request" />
      <main className="flex flex-col flex-1 gap-4">
        <SummaryHeader label="Request">Change default account</SummaryHeader>
        <SummaryCard>
          <SummaryRow
            label={
              <>
                New default <strong>{alias}</strong>
              </>
            }
          >
            {address && shortenAddress(address)}
          </SummaryRow>
        </SummaryCard>
      </main>
      <ApprovalActions
        onApprove={() => void handleResponse(true)}
        onReject={() => void handleResponse(false)}
      />
    </Stack>
  );
};
