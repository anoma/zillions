import { queryOptions, useQuery } from "@tanstack/react-query";
import type { SdkWallet } from "../lib/sdk/wallet";
import { useWallet } from "./useWallet";

export function shieldFee(wallet: SdkWallet, enabled: boolean) {
  return queryOptions({
    queryKey: ["shieldFee", wallet.id],
    queryFn: async () => {
      const pczt = await wallet.prepareShield();
      try {
        return pczt.fee();
      } finally {
        pczt.free();
      }
    },
    enabled,
    retry: false,
  });
}

/**
 * Previews the ZIP-317 fee for shielding by building (and discarding) the
 * shielding PCZT. Same caveat as useFee: the submitted transaction is built
 * fresh and may differ slightly if wallet state changes in between.
 */
export function useShieldFee(enabled: boolean) {
  const sdkWallet = useWallet();
  return useQuery(shieldFee(sdkWallet, enabled));
}
