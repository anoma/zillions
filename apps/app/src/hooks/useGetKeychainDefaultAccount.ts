import { queryOptions, useQuery } from "@tanstack/react-query";
import { keychain, retryUnlessLocked } from "../lib/keychain/keychain";

export function getKeychainDefaultAccount() {
  return queryOptions({
    queryKey: ["getKeychainDefaultAccount"],
    queryFn: () => keychain().defaultAccount(),
    retry: retryUnlessLocked,
  });
}

export function useGetKeychainDefaultAccount() {
  return useQuery(getKeychainDefaultAccount());
}
