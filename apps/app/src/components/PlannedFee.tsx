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

export function FeeRow({ fee, pending }: { fee?: bigint; pending: boolean }) {
  return (
    <div className="mt-4 flex items-center justify-between text-xs font-medium">
      <div>Transaction fee</div>
      <div>
        {fee !== undefined ? (
          <ZecValue zat={fee} />
        ) : pending ? (
          <SpinnerIcon className="size-3" />
        ) : (
          "-"
        )}
      </div>
    </div>
  );
}
