import { queryOptions, useQuery } from "@tanstack/react-query";
import type { Wallet } from "../lib/wallet/wallet";
import { useInvalidateOnSync } from "./useInvalidateOnSync";
import { useWallet } from "./useWallet";

export function getBalance(wallet: Wallet) {
  return queryOptions({
    queryKey: ["getBalance", wallet.id],
    queryFn: () => wallet.getBalance(),
  });
}

export function useGetBalance() {
  const wallet = useWallet();
  const options = getBalance(wallet);
  useInvalidateOnSync(options);
  return useQuery(options);
}
