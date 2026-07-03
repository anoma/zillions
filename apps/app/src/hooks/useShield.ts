import { useMutation } from "@tanstack/react-query";
import { keychain } from "../lib/keychain/keychain";
import { pcztFromBase64, pcztToBase64 } from "../lib/keychain/utils";
import { useWallet } from "./useWallet";

/**
 * Shields all transparent funds into the shielded pool. The SDK's
 * pczt_shield sweeps every UTXO above its 0.001 ZEC threshold; partial
 * shielding is not supported upstream.
 */
export function useShield() {
  const sdkWallet = useWallet();

  return useMutation({
    mutationFn: async function ({ signer }: { signer: string }) {
      const pczt = await sdkWallet.prepareShield();
      const signed = await keychain().sign({
        signer,
        pczt: pcztToBase64(pczt),
      });
      const signedPczt = pcztFromBase64(signed);
      return sdkWallet.submitTransfer(signedPczt);
    },
  });
}
