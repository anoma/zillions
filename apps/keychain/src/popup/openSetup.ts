import browser from "webextension-polyfill";

/**
 * Open (or focus) the Setup tab. Used when the popup opens but no wallet
 * exists yet — onboarding lives in a full-page tab, not the cramped popup.
 * If a Setup tab is already open we focus it rather than opening a duplicate.
 */
export const openSetupTab = async (): Promise<void> => {
  const url = browser.runtime.getURL("/setup.html");
  const existing = await browser.tabs.query({ url });
  const tab = existing[0];
  if (tab?.id != null) {
    await browser.tabs.update(tab.id, { active: true });
    if (tab.windowId != null) {
      await browser.windows.update(tab.windowId, { focused: true });
    }
    return;
  }
  await browser.tabs.create({ url });
};
