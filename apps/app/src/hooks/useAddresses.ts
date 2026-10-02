import { queryOptions, useQuery } from "@tanstack/react-query";
import initZcore, { address_kind, fresh_address } from "@zillions/zcore";
import { useEffect, useState } from "react";
import type { ZWallet } from "../lib/zcrawler/ZWallet";
import { useAccount } from "./useAccount";
import { useInvalidateOnSync } from "./useInvalidateOnSync";
import { useWallet } from "./useWallet";

const NETWORK = import.meta.env.VITE_ZCASH_NETWORK ?? "main";

/** A new shielded address per mount of the caller and per change of `round`; undefined while it's made. */
export function useFreshAddress(round = 0) {
  const ufvk = useAccount().shielded.viewingKey;
  const [fresh, setFresh] = useState<{ ufvk: string; address: string }>();

  useEffect(() => {
    if (!ufvk) return;
    let live = true;
    initZcore().then(() => {
      if (live) setFresh({ ufvk, address: fresh_address(NETWORK, ufvk) });
    });
    return () => {
      live = false;
    };
  }, [ufvk, round]);

  // Never the previous account's address while the new one is made.
  return fresh?.ufvk === ufvk ? fresh?.address : undefined;
}

function addressKind(address: string | undefined) {
  return queryOptions({
    queryKey: ["addressKind", NETWORK, address],
    enabled: !!address,
    staleTime: Infinity,
    queryFn: async () => {
      await initZcore();
      return (address_kind(NETWORK, address!) ?? null) as
        | "shielded"
        | "transparent"
        | null;
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

export function internalAddress(wallet: ZWallet) {
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
