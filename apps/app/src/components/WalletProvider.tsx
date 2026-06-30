import { useEffect, useState, type ReactNode } from "react";
import { WalletContext } from "../context/wallet";
import { useAccount } from "../hooks/useAccount";
import { invariant } from "../lib/invariant";
import { SdkWallet } from "../lib/sdk/wallet";
import { PageError } from "./PageError";
import { PageLoader } from "./PageLoader";

export function WalletProvider({ children }: { children: ReactNode }) {
  const account = useAccount();

  const [wallet, setWallet] = useState<SdkWallet | undefined>(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const safeSetWallet = (value: SdkWallet | undefined) => {
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
        const instance = await SdkWallet.build({
          id: account.shielded.id,
          ufvk: account.shielded.viewingKey,
          birthday: account.shielded.birthday,
        });
        if (cancelled) {
          instance.free();
        } else {
          safeSetWallet(instance);
        }
      } catch (err) {
        if (!cancelled) {
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
