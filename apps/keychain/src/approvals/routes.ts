/**
 * Approvals window route table, shared between the UI (ApprovalsApp routes)
 * and the background (ApprovalsService builds `approvals.html#<route>?...`
 * URLs when launching the popup window).
 */
export default {
  approveConnection: (): string => "/approve-connection",
  approveDisconnection: (): string => "/approve-disconnection",
  approveUpdateDefaultAccount: (): string => "/approve-update-default-account",
  approveOpenLinkKey: (): string => "/approve-open-link-key",
  approveSignTx: (
    msgId: string = ":msgId",
    origin: string = ":origin",
    accountType: string = ":accountType",
    signer: string = ":signer"
  ): string => `/approve-sign-tx/${msgId}/${origin}/${accountType}/${signer}`,
  confirmSignTx: (): string => "/confirm-sign-tx",
};
