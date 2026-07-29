import { useEffect, useState, type ReactNode } from "react";
import { WalletContext } from "../context/wallet";
import { useAccount } from "../hooks/useAccount";
import { invariant } from "../lib/invariant";
import { ZWallet } from "../lib/zcrawler/ZWallet";
import { PageError } from "./PageError";
import { PageLoader } from "./PageLoader";

export function WalletProvider({ children }: { children: ReactNode }) {
  const account = useAccount();

  const [wallet, setWallet] = useState<ZWallet | undefined>(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const safeSetWallet = (value: ZWallet | undefined) => {
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
        invariant(account.shielded.viewingKey, "viewingKey is not available");
        const instance = new ZWallet({
          id: account.shielded.id,
          ufvk: account.shielded.viewingKey,
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

  return (
    <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>
  );
}
