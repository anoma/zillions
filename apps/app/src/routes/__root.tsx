import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AppLayout } from "../components/AppLayout";
import { AppLoader } from "../components/AppLoader";
import { KeychainWall } from "../components/KeychainWall";

export const Route = createRootRoute({ component: RootLayout });

function RootLayout() {
  return (
    <AppLoader>
      <KeychainWall>
        <AppLayout>
          <Outlet />
        </AppLayout>
      </KeychainWall>
    </AppLoader>
  );
}
