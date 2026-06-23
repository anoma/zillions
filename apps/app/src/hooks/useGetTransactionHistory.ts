import { useQuery } from "@tanstack/react-query";
import { useWallet } from "./useWallet";

export function useGetTransactionHistory() {
  const wallet = useWallet();
  return useQuery({
    queryKey: ["useGetTransactionHistory"],
    queryFn: () => wallet.getTransactionHistory(),
  });
}
