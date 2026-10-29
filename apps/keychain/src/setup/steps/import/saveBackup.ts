/**
 * Restore the chosen backup and report progress to the completion step.
 * Shared by ImportSecret (password already set) and NameAndPassword.
 */
import type { Dispatch } from "react";

import type { BackgroundClient } from "../../../ipc/client";
import { restoreBackup } from "../../model/accountManager";
import type { WizardEvent } from "../../model/wizard";

export const saveBackup = async (
  client: BackgroundClient,
  dispatch: Dispatch<WizardEvent>,
  input: {
    file: string;
    backupPassword: string;
    passwordRequired: boolean;
    password?: string;
  }
): Promise<void> => {
  dispatch({ type: "goToStep", step: "import.complete" });
  dispatch({ type: "completionStarted", info: "Starting…" });

  const result = await restoreBackup(client, input, (info) =>
    dispatch({ type: "completionInfo", info })
  );

  if (result.ok) {
    dispatch({ type: "completionSucceeded", backupSummary: result.summary });
  } else {
    dispatch({ type: "completionFailed", info: result.error });
  }
};
