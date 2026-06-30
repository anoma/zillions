import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import { useWallet } from "../hooks/useWallet";
import { Tooltip } from "./Tooltip";

export function SyncIndicator() {
  const [isSyncing, setIsSyncing] = useState(true);
  const wallet = useWallet();

  useEffect(() => {
    // TODO allow to call sync from other components, this is fundamentally important for transfers
    wallet.sync().then(() => setIsSyncing(false));
  }, [wallet]);

  return (
    <div className="group/tooltip relative">
      <button
        className="h-10 p-2 text-left cursor-pointer"
        onClick={async () => {
          setIsSyncing(true);
          await wallet.sync();
          setIsSyncing(false);
        }}
      >
        {isSyncing && (
          <div className="absolute size-2.5 -m-px animate-ping rounded-full bg-gold opacity-75" />
        )}
        <div
          className={twMerge(
            "size-2 rounded-full",
            isSyncing ? "bg-gold animate-pulse" : "bg-green-500",
          )}
        />
      </button>
      <Tooltip position="bottom" className="z-10 w-47 py-3">
        <div className="px-4 space-y-3 w-full text-xs font-medium">
          {isSyncing ? (
            <div className="font-normal">
              Syncing your shielded assets now. Balances will update in a few
              seconds.
            </div>
          ) : (
            <div>Shielded sync completed</div>
          )}
        </div>
      </Tooltip>
    </div>
  );
}
