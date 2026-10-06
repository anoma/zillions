import { ActionButton } from "@zillions/components";

type ApprovalActionsProps = {
  /** Without it, approving submits the surrounding form. */
  onApprove?: () => void;
  onReject: () => void;
  approveDisabled?: boolean;
  approveLabel?: string;
  rejectLabel?: string;
};

/** Reject and Approve, side by side, at the foot of an approval screen. */
export const ApprovalActions = ({
  onApprove,
  onReject,
  approveDisabled,
  approveLabel = "Approve",
  rejectLabel = "Reject",
}: ApprovalActionsProps) => (
  <div className="grid grid-cols-2 gap-3">
    <ActionButton type="button" onClick={onReject} outlineColor="black">
      {rejectLabel}
    </ActionButton>
    <ActionButton
      type={onApprove ? "button" : "submit"}
      onClick={onApprove}
      disabled={approveDisabled}
    >
      {approveLabel}
    </ActionButton>
  </div>
);
