import { describe, expect, test } from "vitest";
import {
  byStance,
  type ChainRound,
  hexFromBase64,
  leadingOption,
  optionResults,
  roundSigners,
  stanceOf,
  toRound,
  toTally,
} from "./vote";

// Entries from the production registry, 2026-11-27.
const layout = {
  pir_depth: 20,
  tier0_layers: 12,
  tier1_layers: 8,
  poly_len: 4096,
};
const nu71 = {
  id: "290ce255ee4c4d63457a55b3e72e07c579e44b6e578438a01c3eaad5c158991e",
  entry: {
    auth_version: 2,
    ea_pk: "WLdUCvtz2YemIvsO9Yz13CRaH4PlH06RCPYFnLkRVKg=",
    signatures: [
      {
        key_id: "valargroup",
        alg: "ed25519",
        sig: "a319gs15PZt6vZa2o+9b/eBR0bxYpezgAbE+6R2oMjzlHLwR+FgxVadiB+xQup76XEdA/BbRPTs7qrLsuUZ6BA==",
      },
      {
        key_id: "tachyon",
        alg: "ed25519",
        sig: "ROsOdnbTgGx5XoyND+sRPCOmDw0+8riTIinYVxk5BzMayuBhxCnKtwujd3Gb0e00seWHprD7UX5RkOWWeo+6DA==",
      },
    ],
  },
};
// Signed under the previous PIR layout, and not re-signed since.
const nu7Scope = {
  id: "16eef7ebc77e0e04fb1c7329abfcc390f4a0c002964671ebb360914a3e5a3f11",
  entry: {
    auth_version: 2,
    ea_pk: "wRS3/XKonR3xOxttb2zir4omb1zGmYuRWZzl+cHbIBs=",
    signatures: [
      {
        key_id: "valargroup",
        alg: "ed25519",
        sig: "fvf+K533MnMrSB0aKDVGIPL1IvY+AWi4op422wsajp5y0n0B7w65sDOM83GZWPriB7p8YHl1hxMz5gL2iIDvCg==",
      },
    ],
  },
};

describe("roundSigners", () => {
  test("a registry entry signed under the current layout", async () => {
    expect(
      await roundSigners(nu71.id, nu71.entry.ea_pk, nu71.entry, layout),
    ).toEqual(["valargroup", "tachyon"]);
  });

  test("a finished round signed under an earlier layout", async () => {
    expect(
      await roundSigners(
        nu7Scope.id,
        nu7Scope.entry.ea_pk,
        nu7Scope.entry,
        layout,
      ),
    ).toEqual(["valargroup"]);
  });

  test("a chain key that isn't the signed one", async () => {
    expect(
      await roundSigners(nu71.id, nu7Scope.entry.ea_pk, nu71.entry, layout),
    ).toEqual([]);
  });

  test("a signature moved to another round", async () => {
    const moved = { ...nu71.entry, ea_pk: nu7Scope.entry.ea_pk };
    expect(
      await roundSigners(nu7Scope.id, nu7Scope.entry.ea_pk, moved, layout),
    ).toEqual([]);
  });

  test("an unknown signer", async () => {
    const entry = {
      ...nu71.entry,
      signatures: [{ ...nu71.entry.signatures[0], key_id: "someone" }],
    };
    expect(await roundSigners(nu71.id, entry.ea_pk, entry, layout)).toEqual([]);
  });
});

test("stanceOf reads the ballots in use", () => {
  expect(stanceOf("Support")).toBe("For");
  expect(stanceOf("Accept")).toBe("For");
  expect(stanceOf("Oppose")).toBe("Against");
  expect(stanceOf("Reject - Do Not Support the Proposed Project")).toBe(
    "Against",
  );
  expect(stanceOf("Abstain.")).toBe("Abstain");
  expect(stanceOf("Preserve halvings.")).toBe("Choice");
});

const chainRound = (over: Partial<ChainRound> = {}): ChainRound => ({
  vote_round_id: "KQziVe5MTWNFelWz5y4HxXnkS25XhDigHD6q1cFYmR4=",
  title: "NU7.1 Poll",
  status: 3,
  snapshot_height: 3578540,
  vote_end_time: 1796093940,
  ea_pk: nu71.entry.ea_pk,
  proposals: [
    {
      id: 1,
      title: "Wind Down ZCG",
      options: [
        { label: "Support" },
        { index: 1, label: "Oppose" },
        { index: 2, label: "Abstain" },
      ],
      forum_url: null,
    },
    {
      id: 2,
      title: "NSM Issuance Smoothing",
      options: [
        { label: "Smooth issuance curve." },
        { index: 1, label: "Preserve halvings." },
        { index: 2, label: "Abstain." },
      ],
    },
  ],
  ...over,
});

describe("toRound", () => {
  test("names the round by its hex id and fills in the zero index", () => {
    const round = toRound(chainRound(), ["valargroup"]);
    expect(round?.id).toBe(nu71.id);
    expect(hexFromBase64(chainRound().vote_round_id)).toBe(nu71.id);
    expect(round?.status).toBe("Closed");
    expect(round?.proposals[0].options.map((o) => [o.index, o.stance])).toEqual(
      [
        [0, "For"],
        [1, "Against"],
        [2, "Abstain"],
      ],
    );
  });

  test("a ballot of choices isn't for or against", () => {
    const round = toRound(chainRound(), []);
    expect(round?.proposals[1].options.map((o) => o.stance)).toEqual([
      "Choice",
      "Choice",
      "Abstain",
    ]);
    expect(round?.proposals[1].options[0].label).toBe("Smooth issuance curve");
  });

  test("hides test rounds and failed ceremonies", () => {
    expect(toRound(chainRound({ title: "[TEST] NU7.1 Poll" }), [])).toBe(
      undefined,
    );
    expect(toRound(chainRound({ status: 5 }), [])).toBe(undefined);
    expect(toRound(chainRound({ status: 4 }), [])).toBe(undefined);
  });
});

test("results: the omitted zero decision, shares and the leader", () => {
  const tally = toTally({
    results: [
      { proposal_id: 1, total_value: 179079 },
      { proposal_id: 1, vote_decision: 1, total_value: 19007459 },
      { proposal_id: 1, vote_decision: 2, total_value: 33181 },
    ],
  });
  const proposal = toRound(chainRound(), [])!.proposals[0];
  const { results, total } = optionResults(proposal, tally.get(1));
  // 0.125 ZEC a ballot.
  expect(total).toBe(19219719n * 12_500_000n);
  expect(results.map((r) => r.zat)).toEqual([
    179079n * 12_500_000n,
    19007459n * 12_500_000n,
    33181n * 12_500_000n,
  ]);
  expect(results.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 3);
  expect(leadingOption(results)?.label).toBe("Oppose");
});

test("no votes yet: no shares and no leader", () => {
  const proposal = toRound(chainRound(), [])!.proposals[0];
  const { results, total } = optionResults(proposal, undefined);
  expect(total).toBe(0n);
  expect(results.every((r) => r.share === 0)).toBe(true);
  expect(leadingOption(results)).toBe(undefined);
});

test("byStance sums the kinds of reject into one", () => {
  const options = toRound(
    chainRound({
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
    }),
    [],
  )!.proposals[0];
  const tally = toTally({
    results: [
      { proposal_id: 1, total_value: 2 },
      { proposal_id: 1, vote_decision: 1, total_value: 5 },
      { proposal_id: 1, vote_decision: 2, total_value: 1 },
      { proposal_id: 1, vote_decision: 3, total_value: 2 },
    ],
  });
  const grouped = byStance(optionResults(options, tally.get(1)).results);
  expect(grouped.map((r) => [r.label, r.share])).toEqual([
    ["Accept", 0.2],
    ["Reject", 0.6],
    ["Abstain", 0.2],
  ]);
  expect(leadingOption(grouped)?.label).toBe("Reject");
});

test("byStance leaves a ballot of choices alone", () => {
  const proposal = toRound(chainRound(), [])!.proposals[1];
  const { results } = optionResults(proposal, undefined);
  expect(byStance(results)).toBe(results);
});
