import { queryOptions, useQuery } from "@tanstack/react-query";
import initZcore, { address_kind } from "@zillions/zcore";
import { useEffect, useState } from "react";
import { keychain } from "../lib/keychain/keychain";
import { NETWORK } from "../lib/wallet/config";
import type { Wallet } from "../lib/wallet/wallet";
import { useAccount } from "./useAccount";
import { useInvalidateOnSync } from "./useInvalidateOnSync";
import { useWallet } from "./useWallet";

/** A new shielded address per mount of the caller and per change of `round`; undefined while it's made. */
export function useFreshAddress(round = 0) {
  const account = useAccount().shielded.id;
  const [fresh, setFresh] = useState<{ account: string; address: string }>();

  useEffect(() => {
    let live = true;
    keychain()
      .freshAddress(account)
      .then((address) => {
        if (live) setFresh({ account, address });
      })
      .catch((err) => console.error("[address] no fresh address", err));
    return () => {
      live = false;
    };
  }, [account, round]);

  // Never the previous account's address while the new one is made.
  return fresh?.account === account ? fresh?.address : undefined;
}

function addressKind(address: string | undefined) {
  return queryOptions({
    queryKey: ["addressKind", NETWORK, address],
    enabled: !!address,
    staleTime: Infinity,
    queryFn: async () => {
      await initZcore();
      return (address_kind(NETWORK, address!) ?? null) as
        "shielded" | "transparent" | null;
    },
  });
}

/**
 * Where a payment to `address` lands, as zcore reads it: `"shielded"`,
 * `"transparent"`, or null when it isn't a valid address on this network.
 * Undefined while that's worked out or with no address.
 */
export const useAddressKind = (address: string | undefined) =>
  useQuery(addressKind(address)).data;

export function internalAddress(wallet: Wallet) {
  return queryOptions({
    queryKey: ["internalAddress", wallet.id],
    queryFn: () => wallet.internalAddress(),
  });
}

/** `{ index, address }` of the next internal address; see `nextInternalAddress` for when it's null. */
export function useInternalAddress() {
  const options = internalAddress(useWallet());
  useInvalidateOnSync(options);
  return useQuery(options);
}
