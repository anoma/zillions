import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { BottomNav, MainNav } from "./MainNav";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="sticky top-0 h-0 z-10 max-lg:hidden">
        <div className="h-svh w-50 bg-surface">
          <MainNav />
        </div>
      </div>
      <div className="sticky top-0 h-0 z-10">
        <div className="lg:ml-50 h-20 bg-surface">
          <AppHeader />
        </div>
      </div>
      <main className="lg:pl-50 pt-20 max-lg:pb-16">{children}</main>
      <div className="lg:hidden">
        <BottomNav />
      </div>
    </>
  );
}
