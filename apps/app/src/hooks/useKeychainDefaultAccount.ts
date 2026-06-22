import { useQuery } from "@tanstack/react-query";
import { keychain } from "../lib/keychain/keychain";

export function useKeychainDefaultAccount() {
  return useQuery({
    queryKey: ["useKeychainDefaultAccount"],
    queryFn: () => keychain().defaultAccount(),
  });
}
