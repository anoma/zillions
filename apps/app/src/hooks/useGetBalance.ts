import { useQuery } from "@tanstack/react-query";
import { useWallet } from "./useWallet";

export function useGetBalance() {
  const wallet = useWallet();
  return useQuery({
    queryKey: ["useGetBalance"],
    queryFn: () => wallet.getBalance(),
  });
}
