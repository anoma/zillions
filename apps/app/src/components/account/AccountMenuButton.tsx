import { useCallback, useState } from "react";
import { GoPerson } from "react-icons/go";
import { useAccount } from "../../hooks/useAccount";
import { SyncIndicator } from "../SyncIndicator";
import { AccountDrawer } from "./AccountDrawer";

export function AccountMenuButton() {
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className="relative lg:-mr-1">
      <button
        className="flex items-center gap-2 py-1 pl-3 pr-1 rounded-full text-sm transition-colors duration-300 hover:bg-gold/15 cursor-pointer"
        aria-label="Account menu"
        onClick={() => setOpen(true)}
      >
        {account.transparent.alias}
        <span className="size-7 flex items-center justify-center rounded-full border border-current">
          <GoPerson className="size-4" />
        </span>
      </button>
      {/* A sibling, not a child: its own click re-syncs rather than opening the drawer. */}
      <div className="absolute -right-0.5 -bottom-1">
        <SyncIndicator
          className="h-auto p-1"
          tooltipClassName="left-auto right-0 translate-x-0"
        />
      </div>
      {open && <AccountDrawer onClose={close} />}
    </div>
  );
}
