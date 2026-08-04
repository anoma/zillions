import { queryOptions, useQuery } from "@tanstack/react-query";
import type { ZWallet } from "../lib/zcrawler/ZWallet";
import { useInvalidateOnSync } from "./useInvalidateOnSync";
import { useWallet } from "./useWallet";

export function getTransactionHistory(wallet: ZWallet) {
  return queryOptions({
    queryKey: ["getTransactionHistory", wallet.id],
    queryFn: () => wallet.getTransactionHistory(),
  });
}

export function useGetTransactionHistory() {
  const wallet = useWallet();
  const options = getTransactionHistory(wallet);
  useInvalidateOnSync(options);
  return useQuery(options);
}
