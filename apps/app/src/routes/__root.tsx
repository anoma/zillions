import { QueryClientProvider } from "@tanstack/react-query";
import {
  CatchNotFound,
  createRootRoute,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { AccountHeader } from "../components/AppHeader";
import { AppLayout } from "../components/AppLayout";
import { AppLoader } from "../components/AppLoader";
import { KeychainWall } from "../components/KeychainWall";
import { EnableNav } from "../components/MainNav";
import { NotFound } from "../components/NotFound";
import { WalletProvider } from "../components/WalletProvider";
import { queryClient } from "../lib/queryClient";

export const Route = createRootRoute({ component: RootLayout });

function RootLayout() {
  // A payment link says what it holds before anyone connects: the claim page
  // puts the wall around its Claim button only.
  const claiming = useRouterState({
    select: (s) => s.location.pathname === "/claim",
  });
  return (
    <CatchNotFound fallback={NotFound}>
      <QueryClientProvider client={queryClient}>
        <AppLayout>
          {claiming ? (
            <Outlet />
          ) : (
            <AppLoader>
              <KeychainWall>
                <WalletProvider>
                  <AccountHeader />
                  <EnableNav />
                  <Outlet />
                </WalletProvider>
              </KeychainWall>
            </AppLoader>
          )}
        </AppLayout>
      </QueryClientProvider>
    </CatchNotFound>
  );
}
