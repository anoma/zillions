import { queryOptions, useQuery } from "@tanstack/react-query";
import type { Wallet } from "../lib/wallet/wallet";
import { useInvalidateOnSync } from "./useInvalidateOnSync";
import { useWallet } from "./useWallet";

/** The migration in progress and its next step; null when there's none. */
export function migrationQuery(wallet: Wallet) {
  return queryOptions({
    queryKey: ["migration", wallet.id],
    queryFn: () => wallet.migration(),
  });
}

export function useMigration() {
  const wallet = useWallet();
  const options = migrationQuery(wallet);
  useInvalidateOnSync(options);
  return useQuery(options);
}
