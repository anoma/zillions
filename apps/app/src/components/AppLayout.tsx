import { useState, type ReactNode } from "react";
import { HeaderSlotContext } from "../context/headerSlot";
import { AppHeader } from "./AppHeader";
import { BottomNav, MainNav } from "./MainNav";

export function AppLayout({ children }: { children: ReactNode }) {
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  return (
    <HeaderSlotContext value={headerSlot}>
      <div className="sticky top-0 h-0 z-10 max-lg:hidden">
        <div className="h-svh w-50 bg-surface">
          <MainNav />
        </div>
      </div>
      <div className="sticky top-0 h-0 z-10">
        <div className="lg:ml-50 h-16 bg-surface">
          <AppHeader slotRef={setHeaderSlot} />
        </div>
      </div>
      <main className="lg:pl-50 pt-16 max-lg:pb-16">{children}</main>
      <div className="lg:hidden">
        <BottomNav />
      </div>
    </HeaderSlotContext>
  );
}
