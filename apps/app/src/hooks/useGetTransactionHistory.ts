import { queryOptions, useQuery } from "@tanstack/react-query";
import type { ZWallet } from "../lib/zcrawler/ZWallet";
import { useWallet } from "./useWallet";

export function getTransactionHistory(wallet: ZWallet) {
  return queryOptions({
    queryKey: ["getTransactionHistory", wallet.id],
    queryFn: () => wallet.getTransactionHistory(),
  });
}

export function useGetTransactionHistory() {
  const wallet = useWallet();
  return useQuery(getTransactionHistory(wallet));
}
