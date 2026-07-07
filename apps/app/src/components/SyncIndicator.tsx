import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import { useWallet } from "../hooks/useWallet";
import { Tooltip } from "./Tooltip";

export function SyncIndicator() {
  const [isSyncing, setIsSyncing] = useState(true);
  const [percent, setPercent] = useState(0);
  const wallet = useWallet();

  useEffect(() => {
    // TODO allow to call sync from other components, this is fundamentally important for transfers
    const unsubscribe = wallet.subscribeSyncProgress((e) => {
      setPercent(e.percent);
    });
    wallet
      .sync()
      .catch((e) => console.error("Sync failed", e))
      .finally(() => setIsSyncing(false));
    return unsubscribe;
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
              <div>Shielded sync: {percent.toFixed(0)}%</div>
              <div className="bg-black h-1 rounded-full overflow-clip mt-1">
                <div
                  className="bg-gold h-1 transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          ) : (
            <div>Shielded sync completed</div>
          )}
        </div>
      </Tooltip>
    </div>
  );
}
