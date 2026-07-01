import { queryOptions, useQuery } from "@tanstack/react-query";
import type { SdkWallet } from "../lib/sdk/wallet";
import { isShieldedAddress } from "../lib/utils";
import { useDebouncedValue } from "./useDebouncedValue";
import { useWallet } from "./useWallet";

export function fee(wallet: SdkWallet, to: string, amount: bigint) {
  return queryOptions({
    queryKey: ["fee", wallet.id, to, amount.toString()],
    queryFn: async () => {
      const pczt = await wallet.prepareShildedTransfer(to, amount);
      try {
        return pczt.fee();
      } finally {
        pczt.free();
      }
    },
    enabled: isShieldedAddress(to) && amount > 0n,
    retry: false,
  });
}

/**
 * Previews the ZIP-317 fee for a shielded transfer by building (and discarding) a
 * real PCZT for the given recipient/amount. The fee is exact for that PCZT, but the
 * transaction actually submitted on send is built fresh and may differ slightly if
 * wallet state (spendable notes, chain tip) changes in between.
 */
export function useFee(to: string, amount: bigint) {
  const sdkWallet = useWallet();
  const debouncedTo = useDebouncedValue(to);
  const debouncedAmount = useDebouncedValue(amount);

  return useQuery(fee(sdkWallet, debouncedTo, debouncedAmount));
}
