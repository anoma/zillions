import { queryOptions, useQuery } from "@tanstack/react-query";
import { keychain, retryUnlessLocked } from "../lib/keychain/keychain";

export function getKeychainAccount() {
  return queryOptions({
    queryKey: ["keychainAccount"],
    queryFn: () => keychain().account(),
    retry: retryUnlessLocked,
  });
}

export function useGetKeychainAccount() {
  return useQuery(getKeychainAccount());
}
