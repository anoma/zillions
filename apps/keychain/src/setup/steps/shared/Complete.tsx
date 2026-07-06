/**
 * Final step: shows persistence progress, then the generated accounts. Reads
 * state from the wizard; persistence already ran in NameAndPassword.
 */
import { ActionButton, Alert, Loading, ViewKeys } from "@zillions/components";

import { useWizard } from "../../SetupContext";

export const Complete = (): JSX.Element => {
  const { state } = useWizard();
  const { completion, completionInfo, parentAccount, shieldedAccount } = state;

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

      {completion === "done" && (
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
