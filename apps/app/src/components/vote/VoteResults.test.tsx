// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { optionResults, toRound, toTally } from "../../lib/vote";
import { OptionList, ShareBar } from "./VoteResults";

afterEach(cleanup);

const round = toRound(
  {
    vote_round_id: "KQziVe5MTWNFelWz5y4HxXnkS25XhDigHD6q1cFYmR4=",
    title: "Grants",
    status: 3,
    snapshot_height: 1,
    vote_end_time: 1,
    ea_pk: "",
    proposals: [
      {
        id: 1,
        title: "A grant",
        options: [
          { label: "Accept" },
          { index: 1, label: "Reject - Do Not Support" },
          { index: 2, label: "Reject - Lower Amount" },
          { index: 3, label: "Abstain" },
        ],
      },
    ],
  },
  [],
)!;
const { results } = optionResults(
  round.proposals[0],
  toTally({
    results: [
      { proposal_id: 1, total_value: 4800 },
      { proposal_id: 1, vote_decision: 1, total_value: 2400 },
      { proposal_id: 1, vote_decision: 3, total_value: 800 },
    ],
  }).get(1),
);

const fills = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>("[aria-hidden] > div")].map(
    (f) => [f.className.match(/bg-\S+/)?.[0], f.style.width],
  );

test("a bar fills to its share, in its stance's colour", () => {
  const { container } = render(<ShareBar share={0.3} stance="Against" />);
  expect(fills(container)).toEqual([["bg-vote-against", "30%"]]);
});

test("each option has its share, ZEC and bar; one nobody chose has no fill", () => {
  const { container } = render(<OptionList results={results} />);
  expect(fills(container)).toEqual([
    ["bg-vote-for", "60%"],
    ["bg-vote-against", "30%"],
    ["bg-vote-abstain", "10%"],
  ]);
  expect(screen.getByText("600 ZEC")).toBeTruthy();
  expect(screen.getByText("0%")).toBeTruthy();
});

test("before the count, the options are listed alone", () => {
  const { container } = render(<OptionList results={results} hideShares />);
  expect(screen.queryByText("60%")).toBeNull();
  expect(fills(container)).toEqual([]);
  expect(screen.getByText("Accept")).toBeTruthy();
});
