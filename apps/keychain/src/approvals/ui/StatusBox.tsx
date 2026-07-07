/**
 * Idle/pending/error feedback for a confirm step.
 */
import { Alert } from "@zillions/components";

import { Status } from "../types";

type Props = {
  status?: Status;
  idleText?: string;
  pendingText?: string;
  errorText?: string;
};

export const StatusBox = ({
  status,
  idleText,
  pendingText,
  errorText,
}: Props) => {
  if (status === undefined) {
    return idleText ? <Alert type="warning">{idleText}</Alert> : null;
  }
  if (status === Status.Pending) {
    return <Alert type="info">{pendingText}</Alert>;
  }
  if (status === Status.Failed) {
    return (
      <Alert type="error">
        {errorText}
        <br />
        Try again
      </Alert>
    );
  }
  return null;
};
