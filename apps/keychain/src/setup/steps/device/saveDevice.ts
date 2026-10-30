/**
 * Persist the connected device and report progress to the completion step.
 * Shared by DeviceConnect (password already set) and NameAndPassword.
 */
import type { Dispatch } from "react";

import type { BackgroundClient } from "../../../ipc/client";
import type { DeviceKind, DeviceKeys } from "../../../hardware";
import { createDeviceAccount } from "../../model/accountManager";
import type { WizardEvent } from "../../model/wizard";

export const saveDevice = async (
  client: BackgroundClient,
  dispatch: Dispatch<WizardEvent>,
  input: {
    device: DeviceKind;
    keys: DeviceKeys;
    passwordRequired: boolean;
    password?: string;
  }
): Promise<void> => {
  dispatch({ type: "goToStep", step: "device.complete" });
  dispatch({ type: "completionStarted", info: "Starting…" });

  const result = await createDeviceAccount(client, input, (info) =>
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
