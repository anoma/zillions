import { queryOptions, useQuery } from "@tanstack/react-query";
import { keychain, retryUnlessLocked } from "../lib/keychain/keychain";

export function getKeychainAccounts() {
  return queryOptions({
    queryKey: ["keychainAccounts"],
    queryFn: () =>
      keychain()
        .accounts()
        .then((data) => data ?? []),
    retry: retryUnlessLocked,
  });
}

export function useGetKeychainAccounts() {
  return useQuery(getKeychainAccounts());
}
