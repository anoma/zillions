import type { StoredAccount } from "../../ipc/contract";

/**
 * The wallet name to show for `signer`. A shielded account is named after the
 * wallet (its parent) it belongs to.
 */
export const walletNameFor = (
  accounts: StoredAccount[],
  signer: string
): string | undefined => {
  const account = accounts.find((a) => a.address === signer);
  const wallet =
    account?.parentId ?
      accounts.find((a) => a.id === account.parentId)
    : account;
  return wallet?.alias;
};
