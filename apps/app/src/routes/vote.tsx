import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { LuLock } from "react-icons/lu";
import { twMerge } from "tailwind-merge";
import { PageError } from "../components/PageError";
import { PageLoader } from "../components/PageLoader";
import {
  focusRingClassName,
  inputClassName,
  textButtonClassName,
} from "../components/ui/utils";
import { RoundStatusLabel, ShareBar } from "../components/vote/VoteResults";
import { useNow } from "../hooks/useNow";
import { useVoteRounds, useVoteTally } from "../hooks/useVoteRounds";
import {
  byStance,
  endDate,
  leadingOption,
  optionResults,
  percent,
  type Proposal,
  type Round,
} from "../lib/vote";

const statusFilters = ["all", "open", "closed"] as const;
type StatusFilter = (typeof statusFilters)[number];

type VoteSearch = { status?: StatusFilter; poll?: string; q?: string };

export const Route = createFileRoute("/vote")({
  component: VoteRoute,
  validateSearch: (search: Record<string, unknown>): VoteSearch => ({
    status: statusFilters.find((s) => s === search.status),
    poll: typeof search.poll === "string" ? search.poll : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
  }),
});

// "Open" takes in polls being counted: their results aren't out either.
const matchesStatus = (round: Round, status: StatusFilter) =>
  status === "all" || (status === "closed") === (round.status === "Closed");

const matchesQuery = (proposal: Proposal, q: string) =>
  `${proposal.title}\n${proposal.description}`
    .toLowerCase()
    .includes(q.toLowerCase());

function VoteRoute() {
  const { status = "all", poll: roundId, q = "" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const rounds = useVoteRounds();
  const now = useNow(60_000);

  if (rounds.isPending) {
    return <PageLoader />;
  }

  if (!rounds.isSuccess) {
    return <PageError>{String(rounds.error)}</PageError>;
  }

  const setSearch = (next: VoteSearch) =>
    navigate({
      search: (prev) => ({ ...prev, ...next }),
      replace: true,
    });

  const shown = rounds.data
    .filter((r) => matchesStatus(r, status))
    .filter((r) => !roundId || r.id === roundId)
    .map((r) => ({
      round: r,
      proposals: q
        ? r.proposals.filter((p) => matchesQuery(p, q))
        : r.proposals,
    }))
    .filter((r) => r.proposals.length > 0);

  return (
    <section
      aria-labelledby="vote-title"
      className="p-10 pt-8 max-sm:px-6 overflow-auto"
    >
      <h2 id="vote-title" className="text-2xl font-semibold tracking-tight">
        Vote
      </h2>
      <p className="mt-2 max-w-160 text-sm text-gray-600">
        Polls of Zcash coinholders, each on one or more proposals. Votes count
        by the ZEC held and stay private: only each option's total is published,
        once voting ends.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <StatusTabs
          value={status}
          counts={{
            all: rounds.data.length,
            open: rounds.data.filter((r) => r.status !== "Closed").length,
            closed: rounds.data.filter((r) => r.status === "Closed").length,
          }}
          onChange={(s) => setSearch({ status: s === "all" ? undefined : s })}
        />
        <select
          aria-label="Poll"
          value={roundId ?? ""}
          onChange={(e) => setSearch({ poll: e.target.value || undefined })}
          className={twMerge(
            inputClassName,
            "w-auto max-w-64 h-10 pr-8 text-sm cursor-pointer",
          )}
        >
          <option value="">All polls</option>
          {rounds.data.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Search proposals"
          placeholder="Search proposals"
          value={q}
          onChange={(e) => setSearch({ q: e.target.value || undefined })}
          className={twMerge(inputClassName, "h-10 text-sm sm:w-64 sm:ml-auto")}
        />
      </div>

      {shown.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-600">
          No proposals match these filters
        </p>
      ) : (
        shown.map(({ round, proposals }) => (
          <RoundSection
            key={round.id}
            round={round}
            proposals={proposals}
            searching={q !== ""}
            now={now}
          />
        ))
      )}
    </section>
  );
}

function StatusTabs({
  value,
  counts,
  onChange,
}: {
  value: StatusFilter;
  counts: Record<StatusFilter, number>;
  onChange: (value: StatusFilter) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Status"
      className="flex p-1 gap-1 rounded-full bg-black/5"
    >
      {statusFilters.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          onClick={() => onChange(s)}
          className={twMerge(
            "h-8 px-4 rounded-full text-sm font-medium capitalize cursor-pointer",
            "transition-colors duration-300 text-gray-600 hover:text-black",
            value === s && "bg-card text-black shadow-xs",
            focusRingClassName,
          )}
        >
          {s}
          <span className="ml-1.5 text-xs text-gray-500 tabular-nums">
            {counts[s]}
          </span>
        </button>
      ))}
    </div>
  );
}

/** How many proposals a long poll shows until it's opened up. */
const PREVIEW = 5;

function RoundSection({
  round,
  proposals,
  searching,
  now,
}: {
  round: Round;
  proposals: Proposal[];
  searching: boolean;
  now: number;
}) {
  const tally = useVoteTally(round);
  const [expanded, setExpanded] = useState(false);
  const headingId = `poll-${round.id}`;
  const count = round.proposals.length;
  // A search shows every match; one hidden past the fold would read as none.
  const folded = !searching && !expanded && proposals.length > PREVIEW + 1;
  const shown = folded ? proposals.slice(0, PREVIEW) : proposals;

  return (
    <section
      aria-labelledby={headingId}
      className="mt-16 pt-10 border-t border-line-strong first-of-type:mt-10 first-of-type:pt-0 first-of-type:border-t-0"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium">
        <RoundStatusLabel round={round} now={now} />
        <span className="text-gray-500">
          {proposals.length < count
            ? `${proposals.length} of ${count} proposals match`
            : `${count} ${count === 1 ? "proposal" : "proposals"}`}
        </span>
      </div>
      <h3 id={headingId} className="mt-4 text-xl font-semibold tracking-tight">
        {round.title}
      </h3>
      {round.description && round.description !== round.title && (
        <p className="mt-2 max-w-160 text-sm text-gray-600 line-clamp-2">
          {round.description}
        </p>
      )}
      {round.status !== "Closed" && (
        <p className="mt-4 flex items-center gap-2 text-xs text-gray-600">
          <LuLock aria-hidden="true" className="size-3 shrink-0" />
          {round.status === "Open"
            ? `Votes stay encrypted until voting ends on ${endDate(round)}. Results are published then.`
            : "Voting has ended. Results are published once the votes are counted."}
        </p>
      )}
      {tally.error && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          Couldn't load the results: {tally.error.message}
        </p>
      )}
      <ol
        aria-label={`Proposals in ${round.title}`}
        className="mt-8 border-t border-line divide-y divide-line"
      >
        {shown.map((p) => (
          <li key={p.id}>
            <ProposalRow
              round={round}
              proposal={p}
              votes={tally.data?.get(p.id)}
            />
          </li>
        ))}
      </ol>
      {folded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={twMerge(textButtonClassName, "mt-5 text-sm font-medium")}
        >
          Show all {proposals.length} proposals
        </button>
      )}
    </section>
  );
}

function ProposalRow({
  round,
  proposal,
  votes,
}: {
  round: Round;
  proposal: Proposal;
  votes: Map<number, bigint> | undefined;
}) {
  const { results, total } = optionResults(proposal, votes);
  const grouped = byStance(results);
  const leader = leadingOption(grouped);
  const closed = round.status === "Closed";

  return (
    <Link
      to="/vote/$roundId/$proposalId"
      params={{ roundId: round.id, proposalId: String(proposal.id) }}
      className={twMerge(
        "grid gap-x-12 gap-y-4 items-center",
        closed && "lg:grid-cols-[minmax(0,1fr)_16rem]",
        // The highlight bleeds into the margin, so the text stays in line with the poll's.
        "-mx-4 px-4 py-5 rounded-xl transition-colors duration-300 hover:bg-black/4",
        "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-black",
      )}
    >
      <div className="min-w-0 grid grid-cols-[1.75rem_1fr]">
        <span className="pt-px text-xs text-gray-500 tabular-nums">
          {proposal.id}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium">{proposal.title}</div>
          {proposal.description && (
            <p className="mt-1 max-w-200 text-xs text-gray-600 truncate">
              {proposal.description}
            </p>
          )}
        </div>
      </div>
      {closed &&
        (total > 0n ? (
          <div className="flex flex-col gap-2.5 max-lg:ml-7">
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="min-w-0 text-xs font-medium line-clamp-2">
                {leader ? leader.label : "Only abstentions"}
              </span>
              {leader && (
                <span className="shrink-0 font-semibold tabular-nums">
                  {percent(leader.share)}
                </span>
              )}
            </div>
            <ShareBar
              share={leader?.share ?? 0}
              stance={leader?.stance ?? "Abstain"}
            />
          </div>
        ) : (
          <span className="text-xs text-gray-600 max-lg:ml-7">
            No votes recorded
          </span>
        ))}
    </Link>
  );
}
