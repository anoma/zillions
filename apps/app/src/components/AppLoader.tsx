import { initSdk } from "@zillions/sdk";
import { useEffect, useState, type ReactNode } from "react";
import { waitForKeychainInjection } from "../lib/keychain/keychain";
import { PageLoader } from "./PageLoader";

// Initializes third-party libs and waits for window injections before rendering the app.
// Keep this free of business logic — use domain-specific components (e.g. KeychainWall) for that.
export function AppLoader({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      await Promise.all([initSdk(), waitForKeychainInjection()]);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <PageLoader />;
  }

  return <>{children}</>;
}
