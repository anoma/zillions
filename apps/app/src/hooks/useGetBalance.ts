import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
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
  const queryClient = useQueryClient();

  useEffect(() => {
    return wallet.subscribeSyncProgress(() => {
      queryClient.invalidateQueries(getBalance(wallet));
    });
  }, [queryClient, wallet]);

  return useQuery(getBalance(wallet));
}
