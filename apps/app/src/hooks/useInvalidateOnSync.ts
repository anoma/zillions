import { type QueryFilters, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useWallet } from "./useWallet";

/** Invalidates a wallet query whenever sync reports progress. */
export function useInvalidateOnSync(filters: QueryFilters) {
  const wallet = useWallet();
  const queryClient = useQueryClient();

  useEffect(
    () =>
      wallet.subscribeSyncProgress(() => {
        queryClient.invalidateQueries(filters);
      }),
    [queryClient, wallet, filters],
  );
}
