import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { MainNav } from "./MainNav";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="sticky top-0 h-0">
        <div className="h-svh w-50">
          <MainNav />
        </div>
      </div>
      <div className="sticky top-0 h-0">
        <div className="ml-50 h-20">
          <AppHeader />
        </div>
      </div>
      <main className="pl-50 pt-20">{children}</main>
    </>
  );
}
