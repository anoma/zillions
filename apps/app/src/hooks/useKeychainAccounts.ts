import { useQuery } from "@tanstack/react-query";
import { keychain } from "../lib/keychain/keychain";

export function useKeychainAccounts() {
  return useQuery({
    queryKey: ["useKeychainAccounts"],
    queryFn: () =>
      keychain()
        .accounts()
        .then((response) => response ?? []),
  });
}
