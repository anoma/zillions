import { queryOptions, useQuery } from "@tanstack/react-query";
import type { Wallet } from "../lib/wallet/wallet";
import { useInvalidateOnSync } from "./useInvalidateOnSync";
import { useWallet } from "./useWallet";

export function getTransactionHistory(wallet: Wallet) {
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
