/**
 * PCZT approval screen: what the pending sign request does (amount, from, to,
 * requesting site, fee), then its every input and output (or the raw summary
 * data), with Approve → ConfirmSignTx and Reject → fail the dapp promise + close.
 */
import { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert, Checkbox, Stack } from "@zillions/components";

import { PageHeader } from "../../popup/ui/PageHeader";
import { ClientContext, type ApprovalDetails } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";
import routes from "../routes";
import { ApprovalActions } from "../ui/ApprovalActions";
import { ApprovalPanelHeader } from "../ui/ApprovalPanelHeader";
import { Commitment } from "../ui/Commitment";
import { TransactionDataPanel } from "../ui/TransactionDataPanel";
import { TransferSummary } from "../ui/TransferSummary";
import { walletNameFor } from "../utils/accounts";
import { formatZec } from "../utils/format";
import {
  flowCount,
  HIGH_FEE_ZATOSHI,
  isHighFee,
  summaryAsText,
} from "../utils/pczt";

type Props = {
  details?: ApprovalDetails;
  setDetails: (details: ApprovalDetails) => void;
};

export const ApproveSignTx = ({ details, setDetails }: Props) => {
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
  const [summaryError, setSummaryError] = useState<string>();
  const [walletName, setWalletName] = useState<string>();
  const [highFeeAccepted, setHighFeeAccepted] = useState(false);
  const highFee = details ? isHighFee(details.summary) : false;

  useEffect(() => {
    const fetchDetails = async (): Promise<void> => {
      if (client && msgId && origin) {
        const summary = await client.queryPcztSummary(msgId);
        setDetails({ msgId, signer, origin, summary });
      }
    };

    // Unreadable means unverifiable: say so, and leave nothing to approve.
    fetchDetails().catch((e: unknown) => {
      console.error(e);
      setSummaryError(e instanceof Error ? e.message : String(e));
    });

    client
      ?.queryAccounts()
      .then((accounts) => setWalletName(walletNameFor(accounts, signer)))
      .catch((e) => console.error(e));
  }, []);

  const handleApproveSubmit = useCallback((e: React.FormEvent): void => {
    e.preventDefault();
    navigate(routes.confirmSignTx());
  }, []);

  const handleReject = useCallback(async (): Promise<void> => {
    try {
      if (msgId) {
        await client?.rejectSignTx(msgId);
        return await closeCurrentTab();
      }
      throw new Error("msgId was not provided!");
    } catch (e) {
      console.warn(e);
    }
  }, [msgId]);

  return (
    <Stack className="h-full text-black pt-4 pb-6" gap={4}>
      <PageHeader title="Confirm Transaction" />
      <main className="flex flex-col flex-1 gap-4 overflow-y-auto">
        {summaryError && (
          <Alert type="error" title="This transaction can't be shown">
            {summaryError}
          </Alert>
        )}
        {details && (
          <>
            <TransferSummary
              summary={details.summary}
              walletName={walletName}
              signer={signer}
              origin={origin}
            />
            <section className="mt-2">
              <ApprovalPanelHeader
                numberOfTransactions={flowCount(details.summary)}
                onChangeViewData={setDisplayTransactionData}
                viewTransactionData={displayTransactionData}
              />
              {displayTransactionData ? (
                <TransactionDataPanel data={summaryAsText(details.summary)} />
              ) : (
                <Stack gap={2}>
                  <Commitment summary={details.summary} />
                </Stack>
              )}
            </section>
          </>
        )}
      </main>
      <form onSubmit={handleApproveSubmit}>
        {details && highFee && (
          <Alert
            type="error"
            title="Unusually high fee"
            className="mb-3 text-xs"
          >
            This transaction pays {formatZec(details.summary.fee)} in fees, more
            than {formatZec(HIGH_FEE_ZATOSHI)}. The fee goes to miners, not to
            the recipient, and cannot be recovered.
            <div className="flex items-center gap-3 mt-3">
              <Checkbox
                id="accept-high-fee"
                checked={highFeeAccepted}
                onChange={(e) => setHighFeeAccepted(e.target.checked)}
              />
              <label htmlFor="accept-high-fee" className="text-xs font-bold">
                I understand and want to pay this fee
              </label>
            </div>
          </Alert>
        )}
        <ApprovalActions
          onReject={() => void handleReject()}
          approveDisabled={!details || (highFee && !highFeeAccepted)}
        />
      </form>
    </Stack>
  );
};
