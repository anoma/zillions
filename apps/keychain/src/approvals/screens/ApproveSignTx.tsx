/**
 * PCZT approval screen: who asks and with which account, what the
 * transaction does (amount, recipients, fee, change), then its every input
 * and output, with Approve → ConfirmSignTx and Reject → fail the dapp
 * promise + close.
 */
import { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ActionBar, Button } from "../../popup/ui/Button";
import { Notice } from "../../popup/ui/Notice";
import { ScreenHeader } from "../../popup/ui/ScreenHeader";
import { ClientContext, type ApprovalDetails } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";
import routes from "../routes";
import { NetworkTag } from "../ui/NetworkTag";
import { RequestCard } from "../ui/RequestCard";
import { TransactionDetails } from "../ui/TransactionDetails";
import { TransferSummary } from "../ui/TransferSummary";
import { useWallets } from "../ui/useWallets";
import { walletFor } from "../utils/accounts";
import { formatZec } from "../utils/format";
import { HIGH_FEE_ZATOSHI, isHighFee } from "../utils/pczt";

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
  const [summaryError, setSummaryError] = useState<string>();
  const [highFeeAccepted, setHighFeeAccepted] = useState(false);
  const { accounts } = useWallets();
  const wallet = walletFor(accounts, signer);
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
    <form className="flex flex-col flex-1" onSubmit={handleApproveSubmit}>
      <ScreenHeader
        title={
          details?.summary.paymentLink ? "Confirm payment link" : "Confirm transaction"
        }
        right={<NetworkTag network={details?.summary.network} />}
      />
      <RequestCard
        origin={origin}
        accountLabel="Signing with"
        account={wallet}
      />
      {summaryError && (
        <Notice tone="danger" title="This transaction can't be shown" className="mt-4">
          {summaryError}
        </Notice>
      )}
      {details && (
        <>
          <TransferSummary summary={details.summary} walletName={wallet?.alias} />
          <TransactionDetails summary={details.summary} />
        </>
      )}
      {details && highFee && (
        <Notice tone="danger" title="Unusually high fee" className="mt-4">
          This transaction pays {formatZec(details.summary.fee)} in fees, more
          than {formatZec(HIGH_FEE_ZATOSHI)}. The fee goes to miners, not to
          the recipient, and can&apos;t be recovered.
          <label className="flex items-center gap-2 mt-2 font-bold cursor-pointer">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-danger)]"
              checked={highFeeAccepted}
              onChange={(e) => setHighFeeAccepted(e.target.checked)}
            />
            I understand and want to pay this fee
          </label>
        </Notice>
      )}
      <ActionBar>
        <Button variant="secondary" onClick={() => void handleReject()}>
          Reject
        </Button>
        <Button type="submit" disabled={!details || (highFee && !highFeeAccepted)}>
          Approve
        </Button>
      </ActionBar>
    </form>
  );
};
