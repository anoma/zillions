import type { PcztSummary } from "@zillions/types";
import { shortenAddress, zatoshiToZec } from "@zillions/utils";

import { Card, KeyValue } from "../../popup/ui/Row";
import { Tag } from "../../popup/ui/Tag";
import { formatZec } from "../utils/format";
import {
  CLAIM_FEE,
  isHighFee,
  keptByPool,
  outputPools,
  payments,
  total,
  transferAmount,
  unshielded,
} from "../utils/pczt";

const isTransparent = (address: string): boolean => address.startsWith("t");

const Recipient = ({ address }: { address?: string }) =>
  address ? (
    <span className="inline-flex items-center gap-1.5">
      <Tag tone={isTransparent(address) ? "neutral" : "soft"}>
        {isTransparent(address) ? "Transparent" : "Shielded"}
      </Tag>
      <span className="font-mono text-[11px]" title={address}>
        {shortenAddress(address, 8, 8, "…")}
      </span>
    </span>
  ) : (
    "an unknown address"
  );

/**
 * What the transaction does, most important first: the amount leaving the
 * account, to whom, the fee and the change. Change is whatever the account's
 * viewing key proves is its own, so a payment can't pass for change; with no
 * payment at all, it's a move within the wallet, or an unshield when shielded
 * funds reach its own transparent address.
 */
export const TransferSummary = ({
  summary,
  walletName,
}: {
  summary: PcztSummary;
  walletName?: string;
}) => {
  const paid = payments(summary);
  const kept = keptByPool(summary);
  const moving = paid.length === 0;
  const unshield = unshielded(summary) > 0n;
  const link = summary.paymentLink === true;
  const amount = transferAmount(summary) - (link ? CLAIM_FEE : 0n);
  const mine = total(
    outputPools(summary).flatMap(({ outputs }) => outputs.filter((o) => o.mine))
  );
  const change = unshield ? mine - amount : moving ? 0n : mine;
  const fromTransparent =
    summary.transparentInputs.length > 0 &&
    summary.saplingInputs.length +
      summary.orchardInputs.length +
      summary.ironwoodInputs.length ===
      0;

  return (
    <>
      <section className="pt-5 pb-3 text-center">
        <p className="m-0 mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
          {link ? "Payment link" : unshield ? "Unshielding" : moving ? "Moving" : "Sending"}
        </p>
        <p className="m-0 text-[28px] font-semibold leading-[1.1] tracking-[-0.02em]">
          {zatoshiToZec(amount)}
          <small className="ml-1 text-sm font-semibold text-muted">ZEC</small>
        </p>
        <p
          className={
            isHighFee(summary)
              ? "m-0 mt-1.5 text-[11.5px] font-bold text-danger"
              : "m-0 mt-1.5 text-[11.5px] font-medium text-muted"
          }
        >
          + {formatZec(summary.fee)} fee
        </p>
      </section>
      <Card>
        <KeyValue label="From">
          <b className="font-semibold">{walletName ?? "Your wallet"}</b>
          {" · "}
          {fromTransparent ? "transparent" : "shielded"}
        </KeyValue>
        {link ? (
          <KeyValue label="To">Whoever claims the link</KeyValue>
        ) : unshield ? (
          <KeyValue label="To">
            <b className="font-semibold">{walletName ?? "Your wallet"}</b>
            {" · "}transparent
          </KeyValue>
        ) : moving ? (
          <KeyValue label="To">
            {kept.length === 1 ? `Your wallet, in ${kept[0].pool}` : "Your wallet"}
          </KeyValue>
        ) : (
          paid.map((payment, i) => (
            <KeyValue key={i} label={paid.length > 1 ? `To · ${formatZec(payment.value ?? 0)}` : "To"}>
              <Recipient address={payment.address} />
            </KeyValue>
          ))
        )}
        <KeyValue label="Fee">{formatZec(summary.fee)}</KeyValue>
        {link && <KeyValue label="Claim fee">{formatZec(CLAIM_FEE)}</KeyValue>}
        {change > 0n && (
          <KeyValue label="Change">
            <span className="font-medium">
              {formatZec(change)} back to {walletName ?? "your wallet"}
            </span>
          </KeyValue>
        )}
      </Card>
      {unshield && (
        <p className="m-0 mt-2 text-center text-[11.5px] font-medium text-muted">
          This amount becomes public on chain.
        </p>
      )}
    </>
  );
};

