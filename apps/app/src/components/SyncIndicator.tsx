import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import { useWallet } from "../hooks/useWallet";
import type { SyncProgress } from "../lib/wallet/shielded/phases";
import type { Wallet } from "../lib/wallet/wallet";
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

const actionClass =
  "w-full rounded-full border border-gray-300 py-1 font-medium cursor-pointer hover:bg-gray-100";

const sync = (wallet: Wallet) =>
  wallet.sync().catch((e) => console.error("Sync failed", e));

export function SyncIndicator() {
  const [progress, setProgress] = useState<SyncProgress>({
    phase: "catch-up",
    syncing: true,
  });
  const [percent, setPercent] = useState("0");
  const wallet = useWallet();

  useEffect(() => {
    // TODO allow to call sync from other components, this is fundamentally important for transfers
    const unsubscribe = wallet.subscribeSyncProgress((e) => {
      setProgress(e);
      if (e.percentage !== undefined) {
        setPercent((prev) => formatPercentage(Number(prev), e.percentage!));
      }
    });
    sync(wallet);
    return unsubscribe;
  }, [wallet]);

  const { phase, backTo, spedUp, fry, syncing } = progress;
  const recent = phase === "catch-up" || phase === "setup";
  const failed = recent && !syncing;
  const bar = (
    <div className="bg-black h-1 rounded-full overflow-clip mt-1">
      <div
        className="bg-gold h-1 transition-all"
        style={{ width: `${percent}%` }}
      />
    </div>
  );

  return (
    <Tooltip
      position="bottom"
      className="z-10 w-60 py-3"
      content={
        <div className="px-4 space-y-3 w-full text-xs font-medium">
          {phase === "catch-up" && syncing && (
            <div>Checking for new activity</div>
          )}
          {phase === "setup" && syncing && (
            <div className="font-normal space-y-2">
              <div>
                Setting up your wallet
                {progress.percentage !== undefined && `: ${percent}%`}
              </div>
              {progress.percentage !== undefined && bar}
              <div>
                This happens only once, the first time you open this account.
              </div>
            </div>
          )}
          {failed && <div>Shielded sync stopped. Click to retry.</div>}
          {phase === "history" && (
            <div className="font-normal space-y-2">
              <div>
                Older history: {percent}%
                {backTo !== undefined &&
                  `, back to ${new Date(backTo).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`}
              </div>
              {bar}
              {fry ? (
                <div>Older history is loading in the background.</div>
              ) : spedUp ? (
                <>
                  <div>
                    Older history is loading on your computer&apos;s full power.
                  </div>
                  <button
                    className={actionClass}
                    onClick={() => wallet.setSpeedUp(false)}
                  >
                    Slow down
                  </button>
                  <div className="text-gray-500">
                    Goes back to using less of your computer, so it stays
                    responsive.
                  </div>
                </>
              ) : (
                <>
                  <div>
                    Older history is still loading in the background, using less
                    of your computer so it stays responsive.
                  </div>
                  <button
                    className={actionClass}
                    onClick={() => wallet.setSpeedUp(true)}
                  >
                    Speed up
                  </button>
                  <div className="text-gray-500">
                    Uses your computer&apos;s full power until older history is
                    done. It may run warm and slow down other apps meanwhile.
                  </div>
                </>
              )}
            </div>
          )}
          {phase === "paused" && (
            <div className="font-normal space-y-2">
              <div>Older history is paused to save data (about 16 GB).</div>
              <button className={actionClass} onClick={wallet.downloadHistory}>
                Download older history
              </button>
            </div>
          )}
          {phase === "done" && <div>Shielded sync completed</div>}
        </div>
      }
    >
      <button
        className="h-10 p-2 text-left cursor-pointer"
        onClick={() => sync(wallet)}
      >
        {recent && syncing && (
          <div className="absolute size-2.5 -m-px animate-ping rounded-full opacity-75 bg-gold" />
        )}
        <div
          className={twMerge(
            "size-2 rounded-full",
            recent && syncing
              ? "bg-gold animate-pulse"
              : failed
                ? "bg-red-500"
                : "bg-green-500",
          )}
        />
      </button>
    </Tooltip>
  );
}
