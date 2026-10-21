import { Link } from "@tanstack/react-router";
import { useContext } from "react";
import { createPortal } from "react-dom";
import { GoKebabHorizontal } from "react-icons/go";
import { HeaderSlotContext } from "../context/headerSlot";
import { ZillionsIcon } from "../icons/ZillionsIcon";
import { AccountMenuButton } from "./account/AccountMenuButton";
import { HelpLinks } from "./MainNav";
import { Tooltip } from "./Tooltip";

function MoreMenu() {
  return (
    <Tooltip
      position="bottom"
      className="left-auto right-0 translate-x-0"
      content={
        <div className="px-4 py-1 pb-4 w-40">
          <HelpLinks />
        </div>
      }
    >
      <button className="h-10 -mr-2 p-2 hover:text-gold transition-all cursor-pointer">
        <GoKebabHorizontal className="size-4" />
      </button>
    </Tooltip>
  );
}

/** Portals the account menu into AppLayout's header; must sit inside WalletProvider. */
export function AccountHeader() {
  const slot = useContext(HeaderSlotContext);
  return slot && createPortal(<AccountMenuButton />, slot);
}

export function AppHeader({
  slotRef,
}: {
  slotRef: (el: HTMLElement | null) => void;
}) {
  return (
    <header className="h-full flex items-center justify-end border-b border-line-strong bg-surface px-6">
      <Link to="/" className="mr-auto lg:hidden">
        <ZillionsIcon className="h-8" />
      </Link>
      <div ref={slotRef} className="contents" />
      <div className="lg:hidden">
        <MoreMenu />
      </div>
    </header>
  );
}
