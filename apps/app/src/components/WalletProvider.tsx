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
    (async () => {
      // flush stale wallet state before switching accounts
      setWallet(undefined);
      setError("");

      try {
        invariant(account.viewingKey, "viewingKey is not available");
        const instance = await SdkWallet.build({
          id: account.id,
          ufvk: account.viewingKey,
          birthday: 3337500, // TODO explore the best way to get the birthday
        });
        setWallet(instance);
      } catch (error) {
        setError(String(error));
      }
    })();
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
