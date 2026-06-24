import { queryOptions, useQuery } from "@tanstack/react-query";
import type { SdkWallet } from "../lib/sdk/wallet";
import { useWallet } from "./useWallet";

export function getTransactionHistory(wallet: SdkWallet) {
  return queryOptions({
    queryKey: ["getTransactionHistory", wallet.id],
    queryFn: () => wallet.getTransactionHistory(),
  });
}

export function useGetTransactionHistory() {
  const wallet = useWallet();
  return useQuery(getTransactionHistory(wallet));
}
