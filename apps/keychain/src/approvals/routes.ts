/**
 * Approvals window route table, shared between the UI (ApprovalsApp routes)
 * and the background (ApprovalsService builds `approvals.html#<route>?...`
 * URLs when launching the popup window).
 */
export default {
  approveConnection: (): string => "/approve-connection",
  approveDisconnection: (): string => "/approve-disconnection",
  approveUpdateDefaultAccount: (): string => "/approve-update-default-account",
  approveSignTx: (
    external: string = ":external",
    msgId: string = ":msgId",
    origin: string = ":origin",
    accountType: string = ":accountType",
    signer: string = ":signer"
  ): string => `/approve-sign-tx/${msgId}/${origin}/${accountType}/${signer}/${external}`,
  confirmSignTx: (external: string = ":external"): string => `/confirm-sign-tx/${external}`,
};
