import { queryOptions, useQuery } from "@tanstack/react-query";
import type { Wallet } from "../lib/wallet/wallet";
import { useWallet } from "./useWallet";

/** How often swaps still under way are asked about again. */
const SWAP_POLL_MS = 20_000;

/**
 * The recorded swaps' statuses, from 1Click. Apart from history: sync doesn't
 * change a swap, so this polls on its own, and only while one is unfinished.
 */
export function getSwaps(wallet: Wallet) {
  return queryOptions({
    queryKey: ["getSwaps", wallet.id],
    queryFn: () => wallet.getSwapStatuses(),
    refetchInterval: () => (wallet.hasUnfinishedSwaps() ? SWAP_POLL_MS : false),
  });
}

export function useGetSwaps() {
  const wallet = useWallet();
  return useQuery(getSwaps(wallet));
}
