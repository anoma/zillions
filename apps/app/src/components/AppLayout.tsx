import { useState, type ReactNode } from "react";
import { HeaderSlotContext } from "../context/headerSlot";
import { SetNavEnabledContext } from "../context/nav";
import { AppHeader } from "./AppHeader";
import { BottomNav, MainNav } from "./MainNav";

export function AppLayout({ children }: { children: ReactNode }) {
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const [navEnabled, setNavEnabled] = useState(false);
  return (
    <HeaderSlotContext value={headerSlot}>
      <SetNavEnabledContext value={setNavEnabled}>
        <div className="sticky top-0 h-0 z-10 max-lg:hidden">
          <div className="h-svh w-50 bg-surface">
            <MainNav enabled={navEnabled} />
          </div>
        </div>
        <div className="sticky top-0 h-0 z-10">
          <div className="lg:ml-50 h-16 bg-surface">
            <AppHeader slotRef={setHeaderSlot} />
          </div>
        </div>
        <main className="min-h-svh flex flex-col lg:pl-50 pt-16 max-lg:pb-16">
          {/* Full-page loaders and messages centre in this box, clear of the nav. */}
          <div className="relative flex-1">{children}</div>
        </main>
        <div className="lg:hidden">
          <BottomNav enabled={navEnabled} />
        </div>
      </SetNavEnabledContext>
    </HeaderSlotContext>
  );
}
