import { queryOptions, useQuery } from "@tanstack/react-query";
import { fetchRounds, fetchTally, type Round } from "../lib/vote";

const voteRounds = queryOptions({
  queryKey: ["voteRounds"],
  queryFn: ({ signal }) => fetchRounds(signal),
  staleTime: 60_000,
});

const voteTally = (round: Round | undefined) =>
  queryOptions({
    queryKey: ["voteTally", round?.id],
    queryFn: ({ signal }) => fetchTally(round!.id, signal),
    // Nothing to ask while it's still open.
    enabled: round?.status === "Closed",
    // A closed round's count never changes.
    staleTime: Infinity,
  });

export function useVoteRounds() {
  return useQuery(voteRounds);
}

/** A round's results, once counted. */
export function useVoteTally(round: Round | undefined) {
  return useQuery(voteTally(round));
}
