import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AppLayout } from "../components/AppLayout";
import { AppLoader } from "../components/AppLoader";
import { KeychainWall } from "../components/KeychainWall";
import { WalletProvider } from "../components/WalletProvider";

export const Route = createRootRoute({ component: RootLayout });

const queryClient = new QueryClient();

function RootLayout() {
  return (
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
  );
}
