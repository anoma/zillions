import { QueryClientProvider } from "@tanstack/react-query";
import { CatchNotFound, createRootRoute, Outlet } from "@tanstack/react-router";
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
  return (
    <CatchNotFound fallback={NotFound}>
      <QueryClientProvider client={queryClient}>
        <AppLayout>
          <AppLoader>
            <KeychainWall>
              <WalletProvider>
                <AccountHeader />
                <EnableNav />
                <Outlet />
              </WalletProvider>
            </KeychainWall>
          </AppLoader>
        </AppLayout>
      </QueryClientProvider>
    </CatchNotFound>
  );
}
