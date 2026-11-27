/**
 * Coinholder voting, read-only: the rounds and proposals on the shielded vote
 * chain (github.com/valargroup/vote-sdk) and their results.
 *
 * Anyone can create a round on the chain, so only rounds in the signed round
 * registry (github.com/valargroup/token-holder-voting-config) are shown, and
 * only when a coordinator's signature over the round's key checks out.
 */

export const votingConfigUrls = [
  "https://voting.valargroup.dev/prod/dynamic-voting-config.json",
  "https://raw.githubusercontent.com/valargroup/token-holder-voting-config/main/prod/dynamic-voting-config.json",
];

// Pinned rather than read from the registry: the CSP lists them at build time.
export const voteServers = [
  "https://zvote.zfnd.org",
  "https://zvote.zodl.com",
  "https://prod.vote-chain-primary.valargroup.org",
];

/** The coordinators' round-signing keys, from the registry's static config. */
const trustedKeys: Record<string, string> = {
  valargroup: "8oQiUWq6QDGnAgRw6U3YhnXb6JLFSXauYnWHIFmJRcw=",
  tachyon: "F8L2S+sjsQMwsZr03ebovvbVRd2B8BXx5e8KpTBmxHs=",
  zodl: "b7aj3HFKqKAF/gwIcf01KXqvDN91ww759pjAxN8whBk=",
  "shielded-labs": "Lsn7flRsI5udUOwqK8ShWu1+jU08AkP0/ed8ihj46kE=",
};

export const signerNames: Record<string, string> = {
  valargroup: "Valar Group",
  tachyon: "Project Tachyon",
  zodl: "ZODL",
  "shielded-labs": "Shielded Labs",
};

type PirLayout = {
  pir_depth: number;
  tier0_layers: number;
  tier1_layers: number;
  poly_len: number;
};

// A v2 signature covers the PIR layout current when it was made, and finished
// rounds aren't re-signed when it changes: try the earlier layouts too.
const pastPirLayouts: PirLayout[] = [
  { pir_depth: 19, tier0_layers: 12, tier1_layers: 7, poly_len: 4096 },
];

type RegistryEntry = {
  auth_version: number;
  ea_pk: string;
  signatures: { key_id: string; alg: string; sig: string }[];
};

export type VotingConfig = {
  pir_layout: PirLayout;
  rounds: Record<string, RegistryEntry>;
};

type ChainOption = { index?: number; label: string; description?: string };

type ChainProposal = {
  id: number;
  title: string;
  description?: string;
  options: ChainOption[];
  forum_url?: string | null;
};

export type ChainRound = {
  vote_round_id: string;
  title?: string;
  description?: string;
  status: number;
  snapshot_height: number;
  vote_end_time: number;
  created_at_time?: number;
  ea_pk: string;
  proposals?: ChainProposal[];
};

export type RoundStatus = "Open" | "Counting" | "Closed";

export type VoteOption = {
  index: number;
  label: string;
  description?: string;
  stance: Stance;
};

/** Which way an option leans, for colour; `Choice` when the ballot isn't for/against. */
export type Stance = "For" | "Against" | "Abstain" | "Choice";

export type Proposal = {
  id: number;
  title: string;
  description: string;
  options: VoteOption[];
  url?: string;
};

export type Round = {
  /** Lowercase hex, as the registry and the tally endpoints name it. */
  id: string;
  title: string;
  description: string;
  status: RoundStatus;
  snapshotHeight: number;
  /** Unix seconds. */
  endTime: number;
  createdTime?: number;
  proposals: Proposal[];
  /** Key ids whose signature over this round checked out. */
  signers: string[];
};

/** Zatoshi per option index, per proposal id. */
export type Tally = Map<number, Map<number, bigint>>;

const bytesFromBase64 = (s: string) =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const bytesFromHex = (hex: string) =>
  Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16));

export const hexFromBase64 = (s: string) =>
  Array.from(bytesFromBase64(s), (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );

const u32le = (n: number) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, n, true);
  return bytes;
};

/** What a coordinator signs for `auth_version` 2; matches vote-sdk's `canonicalPayloadV2`. */
function payloadV2(id: string, eaPk: string, layout: PirLayout) {
  return new Uint8Array([
    ...new TextEncoder().encode("zcash-shielded-vote:round-auth:v2"),
    ...bytesFromHex(id),
    ...bytesFromBase64(eaPk),
    ...u32le(layout.pir_depth),
    ...u32le(layout.tier0_layers),
    ...u32le(layout.tier1_layers),
    ...u32le(layout.poly_len),
  ]);
}

async function verifies(
  keyId: string,
  sig: string,
  payload: Uint8Array<ArrayBuffer>,
) {
  const pubkey = trustedKeys[keyId];
  if (!pubkey) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      bytesFromBase64(pubkey),
      "Ed25519",
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      bytesFromBase64(sig),
      payload,
    );
  } catch {
    return false;
  }
}

/** The trusted keys that signed `entry` for round `id` with key `eaPk`; empty when none did. */
export async function roundSigners(
  id: string,
  eaPk: string,
  entry: RegistryEntry,
  layout: PirLayout,
) {
  if (entry.ea_pk !== eaPk) return [];
  const payloads =
    entry.auth_version === 1
      ? [bytesFromBase64(eaPk)]
      : entry.auth_version === 2
        ? [layout, ...pastPirLayouts].map((l) => payloadV2(id, eaPk, l))
        : [];
  const signers: string[] = [];
  for (const { key_id, alg, sig } of entry.signatures) {
    if (alg !== "ed25519") continue;
    for (const payload of payloads) {
      if (await verifies(key_id, sig, payload)) {
        signers.push(key_id);
        break;
      }
    }
  }
  return signers;
}

const statuses: Record<number, RoundStatus> = {
  1: "Open",
  2: "Counting",
  3: "Closed",
};

/** Reads an option's lean from its label: ballots say Support, Accept, Reject - …, Abstain. */
export function stanceOf(label: string): Stance {
  if (/^abstain/i.test(label)) return "Abstain";
  if (/^(support|accept|approve|yes|for)\b/i.test(label)) return "For";
  if (/^(oppose|reject|no|against)\b/i.test(label)) return "Against";
  return "Choice";
}

function toOptions(options: ChainOption[]): VoteOption[] {
  const parsed = options.map((o) => ({
    // The chain omits a zero index, as protobuf JSON does every default.
    index: o.index ?? 0,
    label: o.label.replace(/\.$/, ""),
    description: o.description,
    stance: stanceOf(o.label),
  }));
  // A ballot that's only partly for/against (e.g. "Preserve halvings", "Abstain")
  // reads as a list of choices, not a vote for or against.
  const polar =
    parsed.some((o) => o.stance === "For") &&
    parsed.some((o) => o.stance === "Against") &&
    parsed.every((o) => o.stance !== "Choice");
  return polar
    ? parsed
    : parsed.map((o) =>
        o.stance === "Abstain" ? o : { ...o, stance: "Choice" as const },
      );
}

/** The chain's round as shown; undefined for a test round or one that never opened. */
export function toRound(
  chain: ChainRound,
  signers: string[],
): Round | undefined {
  const status = statuses[chain.status];
  const title = chain.title ?? "";
  if (!status || /^\[test\]/i.test(title)) return undefined;
  return {
    id: hexFromBase64(chain.vote_round_id),
    title,
    description: chain.description ?? "",
    status,
    snapshotHeight: chain.snapshot_height,
    endTime: chain.vote_end_time,
    createdTime: chain.created_at_time,
    proposals: (chain.proposals ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description ?? "",
      options: toOptions(p.options),
      url: p.forum_url ?? undefined,
    })),
    signers,
  };
}

/** The first of `urls` that answers with JSON. */
async function fetchFirst<T>(urls: string[], signal?: AbortSignal): Promise<T> {
  let error: unknown;
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      if (signal?.aborted) throw e;
      error = e;
    }
  }
  throw error;
}

const fromServers = <T>(path: string, signal?: AbortSignal) =>
  fetchFirst<T>(
    voteServers.map((s) => `${s}/shielded-vote/v1${path}`),
    signal,
  );

/** Every signed round on the chain, newest first. */
export async function fetchRounds(signal?: AbortSignal): Promise<Round[]> {
  const [config, { rounds = [] }] = await Promise.all([
    fetchFirst<VotingConfig>(votingConfigUrls, signal),
    fromServers<{ rounds?: ChainRound[] }>("/rounds", signal),
  ]);
  const shown = await Promise.all(
    rounds.map(async (chain) => {
      const id = hexFromBase64(chain.vote_round_id);
      const entry = config.rounds[id];
      if (!entry) return undefined;
      const signers = await roundSigners(
        id,
        chain.ea_pk,
        entry,
        config.pir_layout,
      );
      return signers.length ? toRound(chain, signers) : undefined;
    }),
  );
  return shown
    .filter((r) => r !== undefined)
    .sort((a, b) => b.endTime - a.endTime);
}

type ChainTally = {
  results?: {
    proposal_id: number;
    vote_decision?: number;
    total_value?: number | string;
  }[];
};

/**
 * A tally counts ballots of 0.125 ZEC, not zatoshi as vote-sdk's proto says:
 * its own dashboard multiplies by this (`BALLOT_DIVISOR`).
 */
const ZATOSHI_PER_BALLOT = 12_500_000n;

export function toTally({ results = [] }: ChainTally): Tally {
  const tally: Tally = new Map();
  for (const r of results) {
    const byOption = tally.get(r.proposal_id) ?? new Map<number, bigint>();
    byOption.set(
      r.vote_decision ?? 0,
      BigInt(r.total_value ?? 0) * ZATOSHI_PER_BALLOT,
    );
    tally.set(r.proposal_id, byOption);
  }
  return tally;
}

/** A round's results; empty until its votes are counted. */
export async function fetchTally(
  roundId: string,
  signal?: AbortSignal,
): Promise<Tally> {
  return toTally(
    await fromServers<ChainTally>(`/tally-results/${roundId}`, signal),
  );
}

export type OptionResult = VoteOption & { zat: bigint; share: number };

/** Each option with its votes and share of the total, in ballot order. */
export function optionResults(
  proposal: Proposal,
  votes: Map<number, bigint> | undefined,
): { results: OptionResult[]; total: bigint } {
  const total = proposal.options.reduce(
    (sum, o) => sum + (votes?.get(o.index) ?? 0n),
    0n,
  );
  const results = proposal.options.map((o) => {
    const zat = votes?.get(o.index) ?? 0n;
    return {
      ...o,
      zat,
      // Not truncated: a few ZEC out of millions still reads "<0.1%", not "0%".
      share: total ? Number(zat) / Number(total) : 0,
    };
  });
  return { results, total };
}

/** The option with the most votes, abstentions aside; undefined before any. */
export function leadingOption(results: OptionResult[]) {
  return results
    .filter((r) => r.stance !== "Abstain" && r.zat > 0n)
    .reduce<OptionResult | undefined>(
      (best, r) => (!best || r.zat > best.zat ? r : best),
      undefined,
    );
}

const compact = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** A ZEC amount to the nearest thousand or million, e.g. "19.2M". */
export const compactZec = (zat: bigint) => compact.format(Number(zat) / 1e8);

export const percent = (share: number) =>
  share === 0
    ? "0%"
    : share < 0.001
      ? "<0.1%"
      : `${(share * 100).toFixed(share >= 0.1 ? 0 : 1)}%`;

/** "in 3 days", "in 5 hours": how long until `seconds`, from `now` (ms). */
export function timeLeft(seconds: number, now: number) {
  const hours = (seconds * 1000 - now) / 3_600_000;
  if (hours < 1) return "in under an hour";
  if (hours < 48) return `in ${Math.round(hours)} hours`;
  return `in ${Math.round(hours / 24)} days`;
}

export function endDate(round: Round) {
  return new Date(round.endTime * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * A for/against ballot summed by stance, each named by its first option's
 * label up to " - " (two kinds of "Reject - …" read as one "Reject"); a
 * ballot of choices as it is.
 */
export function byStance(results: OptionResult[]): OptionResult[] {
  if (!results.some((r) => r.stance === "For" || r.stance === "Against")) {
    return results;
  }
  return (["For", "Against", "Abstain"] as const).flatMap((stance) => {
    const group = results.filter((r) => r.stance === stance);
    if (!group.length) return [];
    return {
      ...group[0],
      label: group[0].label.split(" - ")[0],
      description: undefined,
      zat: group.reduce((sum, r) => sum + r.zat, 0n),
      share: group.reduce((sum, r) => sum + r.share, 0),
    };
  });
}
