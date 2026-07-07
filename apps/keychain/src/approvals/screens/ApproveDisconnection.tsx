/**
 * Disconnection approval screen: the dapp at `interfaceOrigin` asked to
 * disconnect (revoke its approval).
 */
import { useContext } from "react";
import { useSearchParams } from "react-router-dom";

import { ActionButton, Alert, GapPatterns, Stack } from "@zillions/components";

import { PageHeader } from "../../popup/ui/PageHeader";
import { ClientContext } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";

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
    <Stack full gap={GapPatterns.TitleContent} className="pt-4 pb-8">
      <PageHeader title="Approve Request" />
      <Stack full className="justify-between" gap={12}>
        <Alert type="warning">
          Approve disconnect for <strong>{interfaceOrigin}</strong>?
        </Alert>
        <Stack gap={2}>
          <ActionButton onClick={() => void handleResponse(true)}>
            Approve
          </ActionButton>
          <ActionButton
            outlineColor="black"
            onClick={() => void handleResponse(false)}
          >
            Reject
          </ActionButton>
        </Stack>
      </Stack>
    </Stack>
  );
};
