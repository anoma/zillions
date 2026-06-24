import { queryOptions, useQuery } from "@tanstack/react-query";
import type { SdkWallet } from "../lib/sdk/wallet";
import { useWallet } from "./useWallet";

export function getBalance(wallet: SdkWallet) {
  return queryOptions({
    queryKey: ["getBalance", wallet.id],
    queryFn: () => wallet.getBalance(),
  });
}

export function useGetBalance() {
  const wallet = useWallet();
  return useQuery(getBalance(wallet));
}
