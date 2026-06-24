import { queryOptions, useQuery } from "@tanstack/react-query";
import { keychain } from "../lib/keychain/keychain";

export function getKeychainDefaultAccount() {
  return queryOptions({
    queryKey: ["getKeychainDefaultAccount"],
    queryFn: () => keychain().defaultAccount(),
  });
}

export function useGetKeychainDefaultAccount() {
  return useQuery(getKeychainDefaultAccount());
}
