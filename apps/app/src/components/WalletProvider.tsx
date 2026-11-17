import { useEffect, useState, type ReactNode } from "react";
import { WalletContext } from "../context/wallet";
import { useAccount } from "../hooks/useAccount";
import { Wallet } from "../lib/wallet/wallet";
import { PageError } from "./PageError";
import { PageLoader } from "./PageLoader";

const walletKeys = new WeakMap<Wallet, number>();
let walletCount = 0;
const keyOf = (wallet: Wallet) => {
  if (!walletKeys.has(wallet)) walletKeys.set(wallet, ++walletCount);
  return walletKeys.get(wallet);
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const account = useAccount();

  const [wallet, setWallet] = useState<Wallet | undefined>(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const safeSetWallet = (value: Wallet | undefined) => {
      setWallet((prev) => {
        try {
          prev?.free();
        } catch {
          // prev may already be freed if this updater ran twice; ignore the double-free error
        }
        return value;
      });
    };

    (async () => {
      try {
        const instance = new Wallet({
          id: account.shielded.id,
          account: account.shielded.address,
          birthday: account.shielded.birthday,
        });
        if (cancelled) {
          instance.free();
        } else {
          safeSetWallet(instance);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError(String(err));
        }
      }
    })();

    return () => {
      cancelled = true;
      safeSetWallet(undefined);
      setError("");
    };
  }, [account]);

  if (error) {
    return <PageError>{error}</PageError>;
  }

  if (!wallet) {
    return <PageLoader />;
  }

  // A new wallet remounts everything below: no state outlives its account.
  return (
    <WalletContext.Provider key={keyOf(wallet)} value={wallet}>
      {children}
    </WalletContext.Provider>
  );
}
