import { useContext } from "react";
import { WalletContext } from "../context/wallet";
import { invariant } from "../lib/invariant";
import type { ZWallet } from "../lib/zcrawler/ZWallet";

export function useWallet(): ZWallet {
  const wallet = useContext(WalletContext);
  invariant(wallet, "wallet is not defined");
  return wallet;
}
