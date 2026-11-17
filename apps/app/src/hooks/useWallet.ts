import { queryOptions, useQuery } from "@tanstack/react-query";
import initZcore from "@zillions/zcore";
import { useContext } from "react";
import { WalletContext } from "../context/wallet";
import { invariant } from "../lib/invariant";
import type { Wallet } from "../lib/wallet/wallet";

export function useWallet(): Wallet {
  const wallet = useContext(WalletContext);
  invariant(wallet, "wallet is not defined");
  return wallet;
}

/**
 * Whether the account's viewing key names no shielded pool — a
 * transparent-only account (a Trezor's): it sends and receives transparently
 * only, and the shielded flows are off for it.
 */
export function useTransparentOnly(): boolean {
  const wallet = useWallet();
  const { data } = useQuery(
    queryOptions({
      queryKey: ["transparentOnly", wallet.id],
      queryFn: async () => {
        await initZcore();
        return wallet.pools.length === 0;
      },
      staleTime: Infinity,
    }),
  );
  return data ?? false;
}
