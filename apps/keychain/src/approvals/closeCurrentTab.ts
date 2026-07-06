import browser from "webextension-polyfill";

/**
 * Close the approvals popup window (it has exactly one tab — this one).
 * The background's `tabs.onRemoved` listener rejects the pending request if
 * it was not already resolved.
 */
export const closeCurrentTab = async (): Promise<void> => {
  const tab = await browser.tabs.getCurrent();
  if (tab?.id) {
    await browser.tabs.remove(tab.id);
  }
};
