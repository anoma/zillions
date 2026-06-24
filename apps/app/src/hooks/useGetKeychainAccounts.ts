import { queryOptions, useQuery } from "@tanstack/react-query";
import { keychain } from "../lib/keychain/keychain";

export function getKeychainAccounts() {
  return queryOptions({
    queryKey: ["keychainAccounts"],
    queryFn: () =>
      keychain()
        .accounts()
        .then((data) => data ?? []),
  });
}

export function useGetKeychainAccounts() {
  return useQuery(getKeychainAccounts());
}
