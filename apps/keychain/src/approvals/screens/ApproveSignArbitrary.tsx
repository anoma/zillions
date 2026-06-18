/**
 * Arbitrary-message approval screen: the connected dapp asked `signer` to sign
 * a message. Shows the message (as a card, or raw via the data toggle) plus the
 * signer/origin, then Approve → ConfirmSignArbitrary (password re-check + sign)
 * or Reject → fail the dapp promise + close.
 */
import { useCallback, useContext, useEffect, useState } from "react";
import { AiOutlineMessage } from "react-icons/ai";
import { useNavigate, useParams } from "react-router-dom";

import { ActionButton, GapPatterns, Stack } from "@zillions/components";
import { shortenAddress } from "@zillions/utils";

import { PageHeader } from "../../popup/ui/PageHeader";
import { ClientContext, type ArbitraryDetails } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";
import routes from "../routes";
import { ApprovalPanelHeader } from "../ui/ApprovalPanelHeader";
import { TransactionCard } from "../ui/TransactionCard";
import { TransactionDataPanel } from "../ui/TransactionDataPanel";

type Props = {
  setArbitraryDetails: (details: ArbitraryDetails) => void;
};

export const ApproveSignArbitrary = ({
  setArbitraryDetails,
}: Props): JSX.Element => {
  const navigate = useNavigate();
  const client = useContext(ClientContext);
  const params = useParams<{ msgId: string; origin: string; signer: string }>();
  const msgId = params.msgId ?? "";
  const origin = decodeURIComponent(params.origin ?? "");
  const signer = params.signer ?? "";
  const [message, setMessage] = useState("");
  const [displayTransactionData, setDisplayTransactionData] = useState(false);

  useEffect(() => {
    if (client && msgId && signer && origin) {
      client
        .querySignArbitrary(msgId)
        .then(({ data }) => {
          setMessage(data);
          setArbitraryDetails({ msgId, signer, data, origin });
        })
        .catch((e) => console.error(e));
    }
  }, [msgId, signer]);

  const handleApproveClick = useCallback((): void => {
    if (signer) {
      navigate(routes.confirmSignArbitrary());
    }
  }, [signer]);

  const handleReject = useCallback(async (): Promise<void> => {
    try {
      if (msgId) {
        await client?.rejectSignArbitrary(msgId);
        return await closeCurrentTab();
      }
      throw new Error("msgId was not provided!");
    } catch (e) {
      console.warn(e);
    }
  }, [msgId]);

  const getDataAsText = (data: string): string => {
    try {
      return JSON.stringify(JSON.parse(data), null, 2);
    } catch {
      // Not JSON — show the raw message.
      return data;
    }
  };

  return (
    <Stack full gap={GapPatterns.TitleContent} className="text-black pt-4 pb-6">
      <PageHeader title="Approve Sign Arbitrary Request" />
      <div className="flex flex-col flex-1 gap-4 justify-between">
        <main className="flex-1">
          <ApprovalPanelHeader
            numberOfTransactions={1}
            onChangeViewData={setDisplayTransactionData}
            viewTransactionData={displayTransactionData}
          />
          {message && !displayTransactionData && (
            <TransactionCard
              title="Sign message"
              content={<span className="italic">{message}</span>}
              icon={<AiOutlineMessage />}
            />
          )}
          {message && displayTransactionData && (
            <TransactionDataPanel data={getDataAsText(message)} />
          )}
        </main>
        <div>
          <Stack gap={2}>
            <p className="text-xs">
              {signer && (
                <>
                  Signer:{" "}
                  <strong className="block">{shortenAddress(signer)}</strong>
                </>
              )}
              <br />
              Origin: <strong className="block">{origin}</strong>
            </p>
          </Stack>
        </div>
        <Stack gap={2}>
          <ActionButton onClick={handleApproveClick}>Approve</ActionButton>
          <ActionButton outlineColor="black" onClick={handleReject}>
            Reject
          </ActionButton>
        </Stack>
      </div>
    </Stack>
  );
};
