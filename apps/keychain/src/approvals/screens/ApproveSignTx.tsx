/**
 * PCZT approval screen: shows the parsed transaction summary (or the raw
 * `to_json()` data) for the pending sign request, with Approve → ConfirmSignTx
 * and Reject → fail the dapp promise + close.
 */
import { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ActionButton, GapPatterns, Stack } from "@zillions/components";
import { shortenAddress } from "@zillions/utils";

import { PageHeader } from "../../popup/ui/PageHeader";
import { ClientContext, type ApprovalDetails } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";
import routes from "../routes";
import { ApprovalPanelHeader } from "../ui/ApprovalPanelHeader";
import { Commitment } from "../ui/Commitment";
import { TransactionDataPanel } from "../ui/TransactionDataPanel";

type Props = {
  details?: ApprovalDetails;
  setDetails: (details: ApprovalDetails) => void;
};

export const ApproveSignTx = ({ details, setDetails }: Props): JSX.Element => {
  const navigate = useNavigate();
  const client = useContext(ClientContext);
  const params = useParams<{
    msgId: string;
    origin: string;
    accountType: string;
    signer: string;
  }>();
  const msgId = params.msgId ?? "";
  const origin = params.origin ?? "";
  const signer = params.signer ?? "";
  const [displayTransactionData, setDisplayTransactionData] = useState(false);

  useEffect(() => {
    const fetchDetails = async (): Promise<void> => {
      if (client && msgId && origin) {
        const summary = await client.queryPcztSummary(msgId);
        setDetails({ msgId, signer, origin, summary });
      }
    };

    fetchDetails().catch((e) => console.error(e));
  }, []);

  const handleApproveSubmit = useCallback((e: React.FormEvent): void => {
    e.preventDefault();
    navigate(routes.confirmSignTx());
  }, []);

  const handleReject = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault();
      try {
        if (msgId) {
          await client?.rejectSignTx(msgId);
          return await closeCurrentTab();
        }
        throw new Error("msgId was not provided!");
      } catch (e) {
        console.warn(e);
      }
    },
    [msgId]
  );

  const getDataAsText = (): string => {
    if (!details) return "";
    return JSON.stringify(details.summary.raw, null, 2);
  };

  // Count of value flows surfaced by the PCZT summary.
  const numberOfTx =
    details ?
      details.summary.transparentInputs.length +
      details.summary.transparentOutputs.length +
      details.summary.saplingInputs.length +
      details.summary.saplingOutputs.length +
      details.summary.orchardInputs.length +
      details.summary.orchardOutputs.length
      : 0;

  return (
    <Stack
      className="h-full text-black pt-4 pb-6"
      gap={GapPatterns.TitleContent}
    >
      <PageHeader title="Confirm Transaction" />
      <div className="flex flex-col h-full gap-4 justify-between">
        <main>
          <ApprovalPanelHeader
            numberOfTransactions={numberOfTx}
            onChangeViewData={setDisplayTransactionData}
            viewTransactionData={displayTransactionData}
          />
          {!displayTransactionData && details && (
            <Stack gap={1}>
              <Commitment summary={details.summary} />
            </Stack>
          )}
          {displayTransactionData && details && (
            <TransactionDataPanel data={getDataAsText()} />
          )}
        </main>
        <Stack gap={2} as="form" onSubmit={handleApproveSubmit}>
          <p className="text-xs">
            {signer && (
              <>
                Signer: <strong>{shortenAddress(signer)}</strong>
                <br />
              </>
            )}
            Origin: <strong>{origin}</strong>
            <br />
            Network: <strong>{details?.summary.network}</strong>
          </p>
          <Stack gap={1.5} direction="vertical">
            <ActionButton>Approve</ActionButton>
            <ActionButton
              onClick={(e: React.FormEvent) => void handleReject(e)}
              outlineColor="black"
            >
              Reject
            </ActionButton>
          </Stack>
        </Stack>
      </div>
    </Stack>
  );
};
