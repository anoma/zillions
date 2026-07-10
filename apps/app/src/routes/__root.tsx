import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CatchNotFound, createRootRoute, Outlet } from "@tanstack/react-router";
import { AppLayout } from "../components/AppLayout";
import { AppLoader } from "../components/AppLoader";
import { KeychainWall } from "../components/KeychainWall";
import { NotFound } from "../components/NotFound";
import { WalletProvider } from "../components/WalletProvider";

export const Route = createRootRoute({ component: RootLayout });

const queryClient = new QueryClient();

function RootLayout() {
  return (
    <CatchNotFound fallback={NotFound}>
      <QueryClientProvider client={queryClient}>
        <AppLoader>
          <KeychainWall>
            <WalletProvider>
              <AppLayout>
                <Outlet />
              </AppLayout>
            </WalletProvider>
          </KeychainWall>
        </AppLoader>
      </QueryClientProvider>
    </CatchNotFound>
  );
}
