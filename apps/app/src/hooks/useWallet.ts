import { useContext } from "react";
import { WalletContext } from "../context/wallet";
import { invariant } from "../lib/invariant";
import type { Wallet } from "../lib/wallet/wallet";

export function useWallet(): Wallet {
  const wallet = useContext(WalletContext);
  invariant(wallet, "wallet is not defined");
  return wallet;
}
