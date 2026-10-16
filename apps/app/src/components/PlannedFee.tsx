import type { useSendPlan } from "../hooks/useSend";
import { SpinnerIcon } from "../icons/SpinnerIcon";
import { ZecValue } from "./ZecValue";

/**
 * A send form's fee row: the plan's fee, or, for an amount the source can't
 * cover, the fee of sending the most it can.
 */
export function PlannedFee({
  plan,
  maxAmount,
  ceiling,
}: ReturnType<typeof useSendPlan>) {
  const fee = plan.data?.fee ?? ceiling?.fee;
  const pending =
    plan.isLoading ||
    maxAmount.isLoading ||
    (ceiling !== undefined && ceiling.amount > 0n);
  return (
    <FeeRow
      fee={fee !== undefined ? BigInt(fee) : undefined}
      pending={pending}
    />
  );
}

/** A summary's closing line: what it all comes to. */
export function TotalRow({
  label = "Total",
  value,
}: {
  label?: string;
  value?: bigint;
}) {
  return (
    <div className="mt-1 pt-3 border-t border-line flex items-center justify-between text-sm font-semibold">
      <span>{label}</span>
      <span aria-live="polite">
        {value !== undefined ? (
          <ZecValue zat={value} />
        ) : (
          <span className="text-gray-500">–</span>
        )}
      </span>
    </div>
  );
}

export function FeeRow({
  fee,
  pending,
  label = "Transaction fee",
}: {
  fee?: bigint;
  pending: boolean;
  label?: string;
}) {
  return (
    <div className="flex items-center justify-between text-xs font-medium">
      <div>{label}</div>
      <div>
        {fee !== undefined ? (
          <ZecValue zat={fee} />
        ) : pending ? (
          <SpinnerIcon className="size-3" />
        ) : (
          <span className="text-gray-500">–</span>
        )}
      </div>
    </div>
  );
}
