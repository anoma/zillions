import { useContext } from "react";
import { WalletContext } from "../context/wallet";
import { invariant } from "../lib/invariant";
import type { SdkWallet } from "../lib/sdk/wallet";

export function useWallet(): SdkWallet {
  const wallet = useContext(WalletContext);
  invariant(wallet, "wallet is not defined");
  return wallet;
}
