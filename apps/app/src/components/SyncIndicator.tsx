import { focusManager, onlineManager } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
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
  "w-full rounded-full border border-line py-1 font-medium cursor-pointer hover:bg-black/5";

const sync = (wallet: Wallet) =>
  wallet.sync().catch((e) => console.error("Sync failed", e));

export function SyncIndicator({
  className,
  tooltipClassName,
}: {
  className?: string;
  tooltipClassName?: string;
}) {
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
    // Back on the tab or online: catch up now rather than at the next timed sync.
    const onBack = (back: boolean) => back && wallet.resync();
    const unsubscribeFocus = focusManager.subscribe(onBack);
    const unsubscribeOnline = onlineManager.subscribe(onBack);
    return () => {
      unsubscribe();
      unsubscribeFocus();
      unsubscribeOnline();
    };
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

  /** History or the spam era running in the background, with its speed controls. */
  const background = (what: string, title: ReactNode, extra?: ReactNode) => (
    <div className="font-normal space-y-2">
      <div>{title}</div>
      {bar}
      {fry ? (
        <div>{what} is loading in the background.</div>
      ) : spedUp ? (
        <>
          <div>{what} is loading on your computer&apos;s full power.</div>
          <button
            className={actionClass}
            onClick={() => wallet.setSpeedUp(false)}
          >
            Slow down
          </button>
          <div className="text-gray-500">
            Goes back to using less of your computer, so it stays responsive.
          </div>
        </>
      ) : (
        <>
          <div>
            {what} is still loading in the background, using less of your
            computer so it stays responsive.
          </div>
          <button
            className={actionClass}
            onClick={() => wallet.setSpeedUp(true)}
          >
            Speed up
          </button>
          <div className="text-gray-500">
            Uses your computer&apos;s full power until it&apos;s done. It may
            run warm and slow down other apps meanwhile.
          </div>
        </>
      )}
      {extra}
    </div>
  );

  return (
    <Tooltip
      position="bottom"
      className={twMerge("z-10 w-60 py-3", tooltipClassName)}
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
          {phase === "history" &&
            background(
              "Older history",
              <>
                Older history: {percent}%
                {backTo !== undefined &&
                  `, back to ${new Date(backTo).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`}
              </>,
            )}
          {phase === "spam" &&
            background(
              "The spam era",
              <>Spam era (2022–23): {percent}%</>,
              <>
                <button
                  className={actionClass}
                  onClick={() => wallet.setSpamSync(false)}
                >
                  Pause spam era sync
                </button>
                <div className="text-gray-500">
                  You can resume it any time from here.
                </div>
              </>,
            )}
          {phase === "paused" && (
            <div className="font-normal space-y-2">
              <div>Older history is paused to save data (about 750 MB).</div>
              <button className={actionClass} onClick={wallet.downloadHistory}>
                Download older history
              </button>
            </div>
          )}
          {phase === "spam-off" && (
            <div className="font-normal space-y-2">
              <div className="font-medium">
                Shielded sync completed, except the 2022–23 spam era
                {!!progress.percentage &&
                  ` (${progress.percentage.toFixed(progress.percentage < 1 ? 1 : 0)}% read)`}
                .
              </div>
              <div>
                Those years hold millions of spam transactions: about 15 GB and
                a few hours of work. You only need them if this account received
                funds in 2022–23.
              </div>
              <button
                className={actionClass}
                onClick={() => wallet.setSpamSync(true)}
              >
                {progress.percentage ? "Resume" : "Sync"} spam era
              </button>
            </div>
          )}
          {phase === "done" && <div>Shielded sync completed</div>}
        </div>
      }
    >
      <button
        className={twMerge("h-10 p-2 text-left cursor-pointer", className)}
        onClick={() => sync(wallet)}
      >
        {recent && syncing && (
          <div className="absolute size-2.5 -m-px animate-ping rounded-full opacity-75 bg-gold" />
        )}
        <div
          className={twMerge(
            "size-2.5 rounded-full ring-2 ring-surface",
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
