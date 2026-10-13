import { Stack } from "@zillions/components";
import type { PcztSummary } from "@zillions/types";
import { shortenAddress } from "@zillions/utils";

import { formatZec } from "../utils/format";
import { isHighFee, keptByPool, payments, transferAmount } from "../utils/pczt";
import { SummaryCard } from "./SummaryCard";
import { SummaryHeader } from "./SummaryHeader";
import { SummaryRow } from "./SummaryRow";

type TransferSummaryProps = {
  summary: PcztSummary;
  /** The signing account's wallet name, once it's been looked up. */
  walletName?: string;
  signer: string;
  origin: string;
};

/**
 * What the transaction does, most important first: the amount leaving the
 * account, from which wallet to whom, the site asking, and the fee. Change is
 * whatever the account's viewing key proves is its own, so a payment can't
 * pass for change; with no payment at all, it's a move within the wallet.
 */
export const TransferSummary = ({
  summary,
  walletName,
  signer,
  origin,
}: TransferSummaryProps) => {
  const paid = payments(summary);
  const kept = keptByPool(summary);
  const moving = paid.length === 0;

  return (
    <Stack gap={3}>
      <SummaryHeader
        label={moving ? "Moving" : "Sending"}
        detail={
          <span className={isHighFee(summary) ? "font-bold text-red-500" : ""}>
            + {formatZec(summary.fee)} fee
          </span>
        }
      >
        {formatZec(transferAmount(summary))}
      </SummaryHeader>
      <SummaryCard>
        <SummaryRow
          label={
            <>
              From <strong>{walletName ?? "your wallet"}</strong>
            </>
          }
        >
          {signer ? shortenAddress(signer) : "Active account"}
        </SummaryRow>
        {moving ? (
          <SummaryRow label="To">
            {kept.length === 1
              ? `Your wallet, in ${kept[0].pool}`
              : "Your wallet"}
          </SummaryRow>
        ) : (
          paid.map((payment, i) => (
            <SummaryRow
              key={i}
              label={
                paid.length > 1 ? `To (${formatZec(payment.value ?? 0)})` : "To"
              }
            >
              <span className="font-mono text-sm">
                {payment.address ?? "an unknown address"}
              </span>
            </SummaryRow>
          ))
        )}
      </SummaryCard>
      <SummaryCard>
        <div className="flex items-center justify-between gap-4">
          <SummaryRow label="Requested By">{origin}</SummaryRow>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="text-xs text-neutral-600">Fee</span>
          <span className="text-base text-sm text-black">
            {formatZec(summary.fee)}
          </span>
        </div>
      </SummaryCard>
    </Stack>
  );
};
