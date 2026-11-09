/**
 * Reject and approve at the foot of an approval screen. Reject works at any
 * time: it fails safe. The approve side is an GuardedButton.
 */
import { useRef, useState } from "react";

import { ActionBar, Button } from "../../popup/ui/Button";
import { useClickGuard } from "./useClickGuard";

type GuardedButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "onClick" | "onPointerDown" | "type"
> & {
  onPress: () => void;
};

/**
 * A button that acts only on a pointer click whose press began while the
 * window was ready (see useClickGuard). Enter and Space do nothing: a site can
 * steer keystrokes into this window more easily than a pointer.
 */
export const GuardedButton = ({ onPress, disabled, ...props }: GuardedButtonProps) => {
  const { ready, readyRef } = useClickGuard();
  const pressedWhileReady = useRef(false);

  return (
    <Button
      {...props}
      disabled={disabled || !ready}
      onPointerDown={() => {
        pressedWhileReady.current = readyRef.current;
      }}
      onClick={(e) => {
        const accepted =
          e.detail > 0 && pressedWhileReady.current && readyRef.current;
        pressedWhileReady.current = false;
        if (accepted) onPress();
      }}
    />
  );
};

type Props = {
  approveLabel: string;
  onApprove: () => Promise<void>;
  onReject: () => Promise<void>;
  rejectLabel?: string;
  approveDisabled?: boolean;
};

/** Both buttons stay disabled while a decision is in flight. */
export const DecisionBar = ({
  approveLabel,
  onApprove,
  onReject,
  rejectLabel = "Reject",
  approveDisabled,
}: Props) => {
  const [busy, setBusy] = useState(false);
  // State lags a render behind; two clicks in one frame must not both act.
  const busyRef = useRef(false);

  const decide = (action: () => Promise<void>) => () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    void action().finally(() => {
      busyRef.current = false;
      setBusy(false);
    });
  };

  return (
    <ActionBar>
      <Button variant="secondary" disabled={busy} onClick={decide(onReject)}>
        {rejectLabel}
      </Button>
      <GuardedButton disabled={busy || approveDisabled} onPress={decide(onApprove)}>
        {approveLabel}
      </GuardedButton>
    </ActionBar>
  );
};
