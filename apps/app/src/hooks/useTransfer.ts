import { useMutation } from "@tanstack/react-query";
import { keychain } from "../lib/keychain/keychain";
import { pcztFromBase64, pcztToBase64 } from "../lib/keychain/utils";
import { isTransparentAddress } from "../lib/utils";
import { useWallet } from "./useWallet";

export function useTransfer() {
  const sdkWallet = useWallet();

  return useMutation({
    mutationFn: async function ({
      from,
      to,
      amount,
    }: {
      from: string;
      to: string;
      amount: bigint;
    }) {
      if (isTransparentAddress(from)) {
        throw new Error("Transfers from transparent are not supported yet.");
      }
      const pczt = await sdkWallet.prepareTransfer(to, amount);
      const signed = await keychain().sign({
        signer: from,
        pczt: pcztToBase64(pczt),
      });
      const signedPczt = pcztFromBase64(signed);
      return sdkWallet.submitTransfer(signedPczt);
    },
  });
}
