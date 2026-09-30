import { queryOptions, useQuery } from "@tanstack/react-query";
import initZcore, { fresh_address } from "@zillions/zcore";
import { useEffect, useState } from "react";
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
  return fresh?.ufvk === ufvk ? fresh.address : undefined;
}

export function useUnshieldAddress() {
  const wallet = useWallet();
  const options = queryOptions({
    queryKey: ["unshieldAddress", wallet.id],
    queryFn: () => wallet.unshieldAddress(),
  });
  useInvalidateOnSync(options);
  return useQuery(options);
}
