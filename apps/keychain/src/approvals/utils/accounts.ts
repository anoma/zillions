import type { StoredAccount } from "../../ipc/contract";

/**
 * The wallet (parent account) to show for `signer`: a shielded account
 * belongs to its parent.
 */
export const walletFor = (
  accounts: StoredAccount[],
  signer: string
): StoredAccount | undefined => {
  const account = accounts.find((a) => a.address === signer);
  return account?.parentId ?
      accounts.find((a) => a.id === account.parentId)
    : account;
};
