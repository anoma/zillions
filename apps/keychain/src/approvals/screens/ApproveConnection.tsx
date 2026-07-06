/**
 * Connection approval screen: the dapp at `interfaceOrigin` asked to connect.
 * If the origin turns out to be already approved (the popup was opened only
 * because the vault was locked), the request auto-approves after login.
 */
import { useContext, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ActionButton, Alert, GapPatterns, Stack } from "@zillions/components";

import { PageHeader } from "../../popup/ui/PageHeader";
import { ClientContext, ExtensionLockContext } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";

export const ApproveConnection = (): JSX.Element => {
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
    <Stack full gap={GapPatterns.TitleContent} className="pt-4 pb-8">
      {typeof isApproved !== "undefined" && !isApproved && (
        <>
          <PageHeader title="Approve Request" />
          <Stack full className="justify-between" gap={12}>
            <Alert type="warning">
              Approve connection for <strong>{interfaceOrigin}</strong>?
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
        </>
      )}
    </Stack>
  );
};
