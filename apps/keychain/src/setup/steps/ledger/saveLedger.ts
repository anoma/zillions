/**
 * Persist the connected Ledger and report progress to the completion step.
 * Shared by Start (password already set) and LedgerPassword.
 */
import type { Dispatch } from "react";

import type { BackgroundClient } from "../../../ipc/client";
import { createLedgerAccount } from "../../model/accountManager";
import type { DeviceKeys } from "../../../hardware";
import type { WizardEvent } from "../../model/wizard";

export const saveLedger = async (
  client: BackgroundClient,
  dispatch: Dispatch<WizardEvent>,
  input: { keys: DeviceKeys; passwordRequired: boolean; password?: string }
): Promise<void> => {
  dispatch({ type: "goToStep", step: "ledger.complete" });
  dispatch({ type: "completionStarted", info: "Starting…" });

  const result = await createLedgerAccount(client, input, (info) =>
    dispatch({ type: "completionInfo", info })
  );

  if (result.ok) {
    dispatch({
      type: "completionSucceeded",
      parentAccount: result.parentAccount,
      shieldedAccount: result.shieldedAccount,
    });
  } else {
    dispatch({ type: "completionFailed", info: result.error });
  }
};
