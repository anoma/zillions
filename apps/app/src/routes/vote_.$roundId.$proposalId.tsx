import {
  createFileRoute,
  Link,
  notFound,
  useParams,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LuLock } from "react-icons/lu";
import { twMerge } from "tailwind-merge";
import { PageError } from "../components/PageError";
import { PageLoader } from "../components/PageLoader";
import {
  focusRingClassName,
  sectionLabelClassName,
} from "../components/ui/utils";
import { OptionList, RoundStatusLabel } from "../components/vote/VoteResults";
import { useNow } from "../hooks/useNow";
import { useVoteRounds, useVoteTally } from "../hooks/useVoteRounds";
import { ExternalLinkIcon } from "../icons/ExternalLinkIcon";
import {
  byStance,
  compactZec,
  endDate,
  leadingOption,
  optionResults,
  percent,
  type Proposal,
  type Round,
  signerNames,
} from "../lib/vote";

export const Route = createFileRoute("/vote_/$roundId/$proposalId")({
  component: ProposalRoute,
});

const linkClassName = twMerge(
  "inline-flex items-center gap-1 rounded-sm underline decoration-transparent underline-offset-4",
  "transition-colors duration-300 hover:decoration-current",
  focusRingClassName,
);

function ProposalRoute() {
  const { roundId = "", proposalId = "" } = useParams({ strict: false });
  const rounds = useVoteRounds();
  const round = rounds.data?.find((r) => r.id === roundId);
  const proposal = round?.proposals.find((p) => String(p.id) === proposalId);

  if (rounds.isPending) {
    return <PageLoader />;
  }

  if (!rounds.isSuccess) {
    return <PageError>{String(rounds.error)}</PageError>;
  }

  if (!round || !proposal) {
    throw notFound();
  }

  return <ProposalPage round={round} proposal={proposal} />;
}

function ProposalPage({
  round,
  proposal,
}: {
  round: Round;
  proposal: Proposal;
}) {
  const now = useNow(60_000);
  const tally = useVoteTally(round);
  const { results, total } = optionResults(
    proposal,
    tally.data?.get(proposal.id),
  );
  const leader = leadingOption(byStance(results));
  const counted = round.status === "Closed" && total > 0n;
  const position = round.proposals.indexOf(proposal) + 1;

  return (
    <article className="p-10 pt-8 max-sm:px-6">
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-2 text-sm font-medium"
      >
        <Link to="/vote" className={linkClassName}>
          Vote
        </Link>
        <span aria-hidden="true" className="text-gray-400">
          /
        </span>
        <Link to="/vote" search={{ poll: round.id }} className={linkClassName}>
          {round.title}
        </Link>
      </nav>

      <div className="mt-8">
        <header>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium">
            <RoundStatusLabel round={round} now={now} />
            <span className="text-gray-500">
              Proposal {position} of {round.proposals.length}
            </span>
          </div>
          <h1 className="mt-4 max-w-200 text-2xl font-semibold tracking-tight text-balance">
            {proposal.title}
          </h1>
        </header>

        <div className="mt-8 pt-8 border-t border-line grid items-start gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1fr)_26rem]">
          {proposal.description && (
            <section aria-labelledby="about-title" className="min-w-0">
              <h2 id="about-title" className={sectionLabelClassName}>
                About this proposal
              </h2>
              <p className="mt-3 max-w-160 text-sm leading-relaxed whitespace-pre-wrap">
                {proposal.description}
              </p>
              {proposal.url && (
                <a
                  href={proposal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={twMerge(linkClassName, "mt-4 text-sm font-medium")}
                >
                  Read the full proposal
                  <ExternalLinkIcon aria-hidden="true" className="size-3" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
            </section>
          )}

          <section
            aria-labelledby="results-title"
            className={twMerge(
              "p-6 max-sm:p-5 rounded-2xl bg-black/4 lg:col-start-2 lg:row-span-2 lg:row-start-1",
              // Once counted the results lead; until then, the proposal does.
              counted && "max-lg:order-first",
            )}
          >
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="results-title" className={sectionLabelClassName}>
                {counted ? "Results" : "Options"}
              </h2>
              {counted && (
                <span className="text-xs font-medium text-gray-600 tabular-nums">
                  {compactZec(total)} ZEC voted
                </span>
              )}
            </div>
            {counted ? (
              <>
                <p className="mt-3 text-lg font-semibold tracking-tight">
                  {leader
                    ? `Most votes: ${leader.label} · ${percent(leader.share)}`
                    : "Only abstentions"}
                </p>
                <div className="mt-6">
                  <OptionList results={results} />
                </div>
              </>
            ) : (
              <>
                <div className="mt-4">
                  <OptionList results={results} hideShares />
                </div>
                <p className="mt-5 flex items-start gap-2 text-xs text-gray-600">
                  <LuLock
                    aria-hidden="true"
                    className="mt-0.5 size-3 shrink-0"
                  />
                  {round.status === "Closed"
                    ? tally.isPending
                      ? "Loading the results…"
                      : tally.error
                        ? `Couldn't load the results: ${tally.error.message}`
                        : "No votes were recorded."
                    : round.status === "Counting"
                      ? "Voting has ended and the votes are being counted."
                      : "Votes stay encrypted until voting ends. Each option's total is published then."}
                </p>
              </>
            )}
          </section>

          <section
            aria-labelledby="details-title"
            className="min-w-0 lg:col-start-1 pt-8 border-t border-line"
          >
            <h2 id="details-title" className={sectionLabelClassName}>
              Details
            </h2>
            <dl className="mt-4 grid gap-x-8 gap-y-5 text-sm sm:grid-cols-3">
              <Detail
                label={round.status === "Open" ? "Voting ends" : "Voting ended"}
              >
                {endDate(round)}
              </Detail>
              <Detail label="Who can vote">
                ZEC holders at block {round.snapshotHeight.toLocaleString()}
                <span className="block mt-0.5 text-xs font-normal text-gray-600">
                  Weighted by ZEC held
                </span>
              </Detail>
              <Detail label="Poll approved by">
                {round.signers.map((s) => signerNames[s] ?? s).join(", ")}
              </Detail>
            </dl>
            {round.description && round.description !== round.title && (
              <p className="mt-6 max-w-160 text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">
                {round.description}
              </p>
            )}
          </section>
        </div>
      </div>
    </article>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-600">{label}</dt>
      <dd className="mt-1 font-medium">{children}</dd>
    </div>
  );
}
