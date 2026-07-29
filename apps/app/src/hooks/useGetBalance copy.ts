import { queryOptions, useQuery } from "@tanstack/react-query";
import type { ZWallet } from "../lib/zcrawler/ZWallet";
import { useWallet } from "./useWallet";

export function getBalance(wallet: ZWallet) {
  return queryOptions({
    queryKey: ["getBalance", wallet.id],
    queryFn: () => wallet.getBalance(),
  });
}

export function useGetBalance() {
  const wallet = useWallet();
  return useQuery(getBalance(wallet));
}
