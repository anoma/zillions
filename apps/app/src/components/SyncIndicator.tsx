import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import { useWallet } from "../hooks/useWallet";
import { Tooltip } from "./Tooltip";

function formatPercentage(previous: number, current: number): string {
  const prevInt = Math.trunc(previous);
  const currInt = Math.trunc(current);

  // If the integer part changed, that's enough to distinguish the values.
  if (prevInt !== currInt) {
    return String(currInt);
  }

  const comparisonPrecision = 6;
  const [, prevFrac = ""] = previous.toFixed(comparisonPrecision).split(".");
  const [, currFrac = ""] = current.toFixed(comparisonPrecision).split(".");

  for (let i = 0; i < comparisonPrecision; i++) {
    if (prevFrac[i] !== currFrac[i]) {
      const fraction = currFrac.slice(0, i + 1).replace(/0+$/, "");
      return fraction ? `${currInt}.${fraction}` : String(currInt);
    }
  }

  // Values are identical up to the comparison precision.
  const fraction = currFrac.replace(/0+$/, "");
  return fraction ? `${currInt}.${fraction}` : String(currInt);
}

export function SyncIndicator() {
  const [isSyncing, setIsSyncing] = useState(true);
  const [percent, setPercent] = useState("0");
  const wallet = useWallet();

  useEffect(() => {
    // TODO allow to call sync from other components, this is fundamentally important for transfers
    const unsubscribe = wallet.subscribeSyncProgress((e) => {
      console.log("Sync progress", e);
      setPercent((prev) => formatPercentage(Number(prev), e.percent));
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
              <div>Shielded sync: {percent}%</div>
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
