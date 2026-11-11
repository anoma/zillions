/**
 * PCZT approval screen: who asks and with which account, what the
 * transaction does (amount, recipients, fee, change), then its every input
 * and output. Approve signs from the click itself when the password was
 * entered in the last 30 minutes and the keys are in software; otherwise it
 * goes on to ConfirmSignTx. Reject fails the dapp promise and closes.
 */
import { useCallback, useContext, useEffect, useState } from "react";
import { CgSpinner } from "react-icons/cg";
import { useNavigate, useParams } from "react-router-dom";

import { Notice } from "../../popup/ui/Notice";
import { ScreenHeader } from "../../popup/ui/ScreenHeader";
import { ClientContext, type ApprovalDetails } from "../ApprovalsApp";
import { closeCurrentTab } from "../closeCurrentTab";
import routes from "../routes";
import { NetworkTag } from "../ui/NetworkTag";
import { DecisionBar } from "../ui/DecisionBar";
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
  const [changeAccepted, setChangeAccepted] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string>();
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

  const handleApprove = async (): Promise<void> => {
    if (!client) return;
    try {
      const [authRequired, device] = await Promise.all([
        client.requiresAuth(),
        client.queryDeviceSignTx(msgId),
      ]);
      if (authRequired || device) {
        await navigate(routes.confirmSignTx());
        return;
      }
      setSigning(true);
      await client.submitSignTx(msgId, signer);
      await closeCurrentTab();
    } catch (e) {
      setSigning(false);
      setSignError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleReject = useCallback(async (): Promise<void> => {
    try {
      if (!msgId) throw new Error("msgId was not provided!");
      await client?.rejectSignTx(msgId);
    } catch (e) {
      // A failed sign already settled the request; closing is all that's left.
      console.warn(e);
    }
    await closeCurrentTab();
  }, [msgId]);

  return (
    <div className="flex flex-col flex-1">
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
      {details?.summary.unusualChange && (
        <Notice tone="danger" title="Change to an address wallets may not find" className="mt-4">
          {formatZec(details.summary.unusualChange.value)} goes to transparent
          address {details.summary.unusualChange.index} of your wallet, far past
          the ones it has used. A wallet restoring your recovery phrase checks
          addresses in order and stops a few past the last used, so it may
          never find this money.
          <label className="flex items-center gap-2 mt-2 font-bold cursor-pointer">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-danger)]"
              checked={changeAccepted}
              onChange={(e) => setChangeAccepted(e.target.checked)}
            />
            I understand and want to send it there
          </label>
        </Notice>
      )}
      {signError && (
        <Notice tone="danger" title="Couldn't sign" className="mt-4">
          {signError}
        </Notice>
      )}
      {signing && (
        <p className="flex items-center justify-center gap-2 mt-4 text-[12.5px] font-medium text-muted">
          <CgSpinner className="size-4 animate-spin text-gold" />
          Signing transaction…
        </p>
      )}
      <DecisionBar
        approveLabel="Approve"
        approveDisabled={
          !details ||
          (highFee && !highFeeAccepted) ||
          (!!details.summary.unusualChange && !changeAccepted) ||
          !!signError
        }
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </div>
  );
};
