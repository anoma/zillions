import { twMerge } from "tailwind-merge";
import {
  compactZec,
  leadingOption,
  type OptionResult,
  percent,
  type Round,
  timeLeft,
  type VoteOption,
} from "../../lib/vote";

// Literal class names, so Tailwind finds them. A choice has no lean: ink.
const stanceColors: Record<VoteOption["stance"], string> = {
  For: "bg-vote-for",
  Against: "bg-vote-against",
  Abstain: "bg-vote-abstain",
  Choice: "bg-black",
};

/** One option's share of the ZEC voted. Decorative: the share is in text beside it. */
export function ShareBar({
  share,
  stance,
  muted,
  className,
}: {
  share: number;
  stance: VoteOption["stance"];
  /** Fades an option that didn't lead, so the leader stands out. */
  muted?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={twMerge(
        "h-1.5 w-full rounded-full overflow-hidden bg-black/8",
        className,
      )}
    >
      {share > 0 && (
        <div
          className={twMerge(
            "h-full min-w-1 rounded-full",
            stanceColors[stance],
            muted && "opacity-40",
          )}
          style={{ width: `${share * 100}%` }}
        />
      )}
    </div>
  );
}

/** Every option of a ballot, each with its description, share and ZEC. */
export function OptionList({
  results,
  hideShares,
}: {
  results: OptionResult[];
  /** Before the count: the options alone. */
  hideShares?: boolean;
}) {
  const leader = leadingOption(results);
  return (
    <ul className={twMerge("flex flex-col", hideShares ? "gap-4" : "gap-6")}>
      {results.map((r) => {
        const leads = !hideShares && r.index === leader?.index;
        return (
          <li key={r.index}>
            <div
              className={twMerge(
                "text-xs",
                leads ? "font-semibold" : "font-medium",
              )}
            >
              {r.label}
            </div>
            {r.description && (
              <p className="mt-1 text-xs text-gray-600">{r.description}</p>
            )}
            {!hideShares && (
              <>
                <ShareBar
                  share={r.share}
                  stance={r.stance}
                  muted={!!leader && !leads}
                  className="mt-2.5"
                />
                <div className="mt-1.5 flex items-baseline justify-between gap-4 text-[11px] tabular-nums">
                  <span className="text-gray-600">{compactZec(r.zat)} ZEC</span>
                  <span
                    className={twMerge(
                      leads ? "font-semibold" : "font-medium text-gray-600",
                    )}
                  >
                    {percent(r.share)}
                  </span>
                </div>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Where a round is, in words, with when it ends or ended; an open one as a pill. */
export function RoundStatusLabel({
  round,
  now,
}: {
  round: Round;
  now: number;
}) {
  if (round.status === "Open") {
    return (
      <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-gold/20 text-black">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-gold" />
        Open · ends {timeLeft(round.endTime, now)}
      </span>
    );
  }
  if (round.status === "Counting") {
    return (
      <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-black/5">
        Counting votes
      </span>
    );
  }
  return (
    <span className="text-gray-600">
      Closed{" "}
      {new Date(round.endTime * 1000).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}
    </span>
  );
}
