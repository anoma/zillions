/**
 * Final step: shows persistence progress, then the generated accounts. Reads
 * state from the wizard; persistence already ran in NameAndPassword.
 */
import { ActionButton, Alert, Loading, ViewKeys } from "@zillions/components";

import type { BackupSummary } from "../../../ipc/contract";
import { useWizard } from "../../SetupContext";

const accountsLabel = (n: number): string =>
  n === 1 ? "1 account" : `${n} accounts`;

const restoredMessage = ({ accounts, skipped }: BackupSummary): string => {
  if (accounts === 0) {
    return "Every account in this backup is already in the Keychain.";
  }
  const restored = `${accountsLabel(accounts)} restored from your backup.`;
  return skipped === 0
    ? restored
    : `${restored} ${accountsLabel(skipped)} already in the Keychain ${skipped === 1 ? "was" : "were"} skipped.`;
};

export const Complete = () => {
  const { state } = useWizard();
  const {
    completion,
    completionInfo,
    parentAccount,
    shieldedAccount,
    backupSummary,
  } = state;

  const closeCurrentTab = async (): Promise<void> => {
    const { default: browser } = await import("webextension-polyfill");
    const tab = await browser.tabs.getCurrent();
    if (tab?.id) await browser.tabs.remove(tab.id);
  };

  return (
    <>
      <Loading
        status={completionInfo}
        imageUrl="/assets/images/loading.png"
        visible={completion === "pending"}
      />

      {completion === "failed" && (
        <Alert data-testid="setup-error-alert" type="error">
          {completionInfo}
        </Alert>
      )}

      {completion === "done" && backupSummary && (
        <div className="flex flex-col flex-1 justify-between">
          <p className="text-black text-center text-base w-full -mt-3 mb-8">
            {restoredMessage(backupSummary)}
          </p>
          <ActionButton
            size="lg"
            data-testid="setup-close-page-btn"
            onClick={closeCurrentTab}
          >
            Finish Setup
          </ActionButton>
        </div>
      )}

      {completion === "done" && !backupSummary && (
        <>
          <p className="text-black text-center text-base w-full -mt-3 mb-8">
            Here are the accounts generated from your keys
          </p>
          <ViewKeys
            transparentAccountAddress={parentAccount?.address}
            shieldedAccountAddress={shieldedAccount?.address}
            trimCharacters={35}
            footer={
              <ActionButton
                size="lg"
                data-testid="setup-close-page-btn"
                onClick={closeCurrentTab}
              >
                Finish Setup
              </ActionButton>
            }
          />
        </>
      )}
    </>
  );
};
