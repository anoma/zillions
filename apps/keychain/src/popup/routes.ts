/**
 * Popup route table. Functions return concrete paths; passing no argument
 * yields the `:param` template for <Route path>.
 */
export default {
  accountList: (): string => "/",
  viewAccount: (accountId: string = ":accountId"): string =>
    `/accounts/${accountId}`,
  viewMnemonic: (accountId: string = ":accountId"): string =>
    `/accounts/${accountId}/mnemonic`,
  viewingKey: (accountId: string = ":accountId"): string =>
    `/accounts/${accountId}/viewing-key`,
  viewSpendingKey: (accountId: string = ":accountId"): string =>
    `/accounts/${accountId}/spending-key`,
  renameAccount: (accountId: string = ":accountId"): string =>
    `/accounts/${accountId}/rename`,
  deleteAccount: (accountId: string = ":accountId"): string =>
    `/accounts/${accountId}/delete`,
  settings: (): string => "/settings",
  changePassword: (): string => "/settings/change-password",
  connectedSites: (): string => "/settings/connected-sites",
  autoLock: (): string => "/settings/auto-lock",
  theme: (): string => "/settings/theme",
  approvalLog: (): string => "/settings/approval-log",
};
