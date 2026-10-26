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

// A payment link says what it holds before anyone connects: the claim page
// puts the wall around its Claim button only. The privacy policy needs no wallet.
const publicPaths = ["/claim", "/privacy-policy"];

function RootLayout() {
  const isPublic = useRouterState({
    select: (s) => publicPaths.includes(s.location.pathname),
  });
  return (
    <CatchNotFound fallback={NotFound}>
      <QueryClientProvider client={queryClient}>
        <AppLayout>
          {isPublic ? (
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
