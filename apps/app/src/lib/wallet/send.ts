/**
 * Sending: upstream's wallet policy (in zcore) plans what to spend, the tree
 * data the chosen notes need comes from ziziphus, and zcore builds the PCZT
 * the keychain signs. Submitting it is `submit.ts`'s.
 */

import { queryOptions } from "@tanstack/react-query";
import initZcore, {
  max_send,
  plan_migration,
  plan_preparation,
  plan_send,
  plan_shield,
  preparation_pczt,
  send_pczt,
  shield_pczt,
  spendable,
  use_migration_test_amounts,
} from "@zillions/zcore";
import { queryClient } from "../queryClient";
import { MIGRATION_TEST_AMOUNTS } from "../utils";
import { CHUNK_SIZE, fetchTreeChunk, fetchTreeTip } from "./chain/indexer";
import { fetchTreeState, treeSize } from "./chain/lightwalletd";
import { NETWORK } from "./config";
import type { OwnUtxo } from "./transparent";
import type { Note, Pool } from "./types";

export type SendRequest = {
  to: string;
  amount: bigint;
  memo?: string;
  /**
   * Which balance pays; within the shielded one, the plan picks pools.
   * `orchard` spends Orchard notes alone: moving them to Ironwood.
   */
  from: "shielded" | "transparent" | "orchard";
};

type Flow = { pool: Pool | "transparent"; value: number };

/** One transaction of a plan, as `plan_send` reports it. */
export type PlanStep = {
  inputs: Flow[];
  /** The notes spent, whose witnesses need their pool's tree. */
  notes: { pool: Pool; position: number }[];
  payments: Flow[];
  change: Flow[];
  fee: number;
};

export type SendPlan = {
  steps: PlanStep[];
  fee: number;
  /** The bucket boundary a ZIP 318 crossing anchors to. */
  bucket?: number;
};

/** What zcore plans from: the unspent notes and UTXOs, and the chain tip. */
export type WalletData = {
  tip: number;
  notes: (Pick<
    Note,
    "pool" | "scope" | "note" | "output_index" | "position" | "height"
  > & { txid: string })[];
  utxos: (OwnUtxo & { height: number })[];
};

/** zcore, with the dev-only migration test amounts when they're on. */
async function init() {
  await initZcore();
  use_migration_test_amounts(MIGRATION_TEST_AMOUNTS);
}

const request = (send: SendRequest) => ({
  ...send,
  amount: Number(send.amount),
});

export async function planSend(wallet: WalletData, send: SendRequest) {
  await init();
  return plan_send(NETWORK, wallet, request(send)) as SendPlan;
}

export type Source = "shielded" | "transparent";

/** What each source can spend now, and `later` once every note is confirmed. */
export type Spendable = Record<Source, { now: bigint; later: bigint }>;

export async function spendableNow(wallet: WalletData): Promise<Spendable> {
  await init();
  const of = (from: Source) => {
    const { now, later } = spendable(NETWORK, wallet, from);
    return { now: BigInt(now), later: BigInt(later) };
  };
  return { shielded: of("shielded"), transparent: of("transparent") };
}

/** The most `send` (its amount ignored) can pay after fees. */
export async function maxSend(wallet: WalletData, send: SendRequest) {
  await init();
  return BigInt(max_send(NETWORK, wallet, request(send)));
}

/** ZIP 318's plan for moving Orchard to Ironwood with privacy; heights are estimates. */
export type MigrationPlan = {
  tip: number;
  orchard: number;
  /** When each preparation transaction is broadcast. */
  preparations: number[];
  /** What each crossing delivers to Ironwood, in broadcast order. */
  transfers: { value: number; height: number }[];
  transferFee: number;
  preparationFee: number;
  /** What stays in Orchard. */
  left: number;
};

/** A fresh draw of the plan: each call shuffles the amounts and timing anew. */
export async function planMigration(wallet: WalletData) {
  await init();
  return plan_migration(NETWORK, wallet) as MigrationPlan;
}

/** A preparation's plan, and how many of the parts asked for it makes. */
export type PreparationPlan = { plan: SendPlan; made: number };

const parts64 = (parts: number[]) => BigUint64Array.from(parts.map(BigInt));

/**
 * The next preparation for `parts`, the transfers without a note yet. It
 * throws "not ready…" while no Orchard note can anchor at a bucket boundary.
 */
export async function planPreparation(wallet: WalletData, parts: number[]) {
  await init();
  return plan_preparation(NETWORK, wallet, parts64(parts)) as PreparationPlan;
}

/** The unsigned PCZT of the preparation `planPreparation` plans, and its plan. */
export async function preparationPczt(
  wallet: WalletData,
  parts: number[],
  ufvk: string,
  account: { seedFingerprint: string; hdIndex: number },
) {
  const { plan } = await planPreparation(wallet, parts);
  const trees = await fetchTrees(plan);
  const pczt: Uint8Array = preparation_pczt(
    NETWORK,
    ufvk,
    account.seedFingerprint,
    account.hdIndex,
    wallet,
    parts64(parts),
    trees,
  );
  return { pczt, plan };
}

const SHIELDED: Pool[] = ["sapling", "orchard", "ironwood"];

// ponytail: a tip is reused for 5 minutes, as any recent root anchors a send;
// shorten it if anchors that old start being refused.
const tipQuery = (pool: Pool) =>
  queryOptions({
    queryKey: ["treeTip", pool],
    queryFn: async () => {
      const start = performance.now();
      const tip = await fetchTreeTip(pool);
      console.log(
        `[trees] ${pool} tip fetched in ${((performance.now() - start) / 1000).toFixed(1)}s`,
      );
      return tip;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

/** The pool's tree tip, fetched again when the cached one is stale or short of `position`. */
async function treeTip(pool: Pool, position: number) {
  const tip = await queryClient.fetchQuery(tipQuery(pool));
  if (tip.size > position) return tip;
  return queryClient.fetchQuery({ ...tipQuery(pool), staleTime: 0 });
}

/** A frozen tree chunk: it never changes. */
const treeChunk = (pool: Pool, chunk: number) =>
  queryClient.fetchQuery({
    queryKey: ["treeChunk", pool, chunk],
    queryFn: () => fetchTreeChunk(pool, chunk),
    staleTime: Infinity,
    retry: false,
  });

/** The chain's trees at a bucket boundary: deep enough never to change. */
const treeState = (height: number) =>
  queryClient.fetchQuery({
    queryKey: ["treeState", height],
    queryFn: () => fetchTreeState(height),
    staleTime: Infinity,
    retry: false,
  });

/**
 * The tree tip of every shielded pool a plan spends from or pays into (each
 * anchors to its real root), plus the frozen chunks holding its notes. A
 * crossing anchors its Orchard and Ironwood at a bucket boundary instead:
 * zcore rebuilds the tips at the size lightwalletd's trees there give, which
 * needs the chunk then filling if it has frozen since.
 */
async function fetchTrees(plan: SendPlan) {
  const bucket =
    plan.bucket === undefined ? undefined : await treeState(plan.bucket);
  if (bucket) {
    console.log(
      `[trees] anchored at bucket ${plan.bucket}: orchard ${treeSize(bucket.orchard)}, ironwood ${treeSize(bucket.ironwood)} notes`,
    );
  }
  const notes = plan.steps.flatMap((s) => s.notes);
  const flows = plan.steps.flatMap((s) => [
    ...s.inputs,
    ...s.payments,
    ...s.change,
  ]);
  const pools = SHIELDED.filter((pool) => flows.some((f) => f.pool === pool));
  const trees = await Promise.all(
    pools.map(async (pool) => {
      const positions = notes
        .filter((n) => n.pool === pool)
        .map((n) => n.position);
      const tip = await treeTip(pool, Math.max(-1, ...positions));
      if (positions.some((p) => p >= tip.size)) {
        throw new Error(
          `The ${pool} tree hasn't reached this wallet's notes yet`,
        );
      }
      const then =
        bucket && (pool === "orchard" || pool === "ironwood")
          ? bucket[pool]
          : undefined;
      // Notes in the chunk still filling are served with the tip itself.
      const frozen = Math.floor(tip.size / CHUNK_SIZE);
      const chunkIds = [
        ...new Set([
          ...positions.map((p) => Math.floor(p / CHUNK_SIZE)),
          ...(then ? [Math.floor(treeSize(then) / CHUNK_SIZE)] : []),
        ]),
      ].filter((c) => c < frozen);
      const chunks = new Map<number, Uint8Array>(
        await Promise.all(
          chunkIds.map(async (c) => [c, await treeChunk(pool, c)] as const),
        ),
      );
      return [pool, { tip: tip.body, chunks, bucket: then }] as const;
    }),
  );
  return Object.fromEntries(trees);
}

/**
 * Fetches the tree data `plan` would need ahead of building it, so the build
 * after the user confirms doesn't wait on ~1 MB tips. Failures are left for
 * the build to meet.
 */
export function prefetchTrees(plan: SendPlan) {
  fetchTrees(plan).catch(() => {});
}

/**
 * The unsigned PCZT for `send`, for the seed account behind `ufvk`, and its
 * plan. Plans first, from the same wallet snapshot, to learn which notes need
 * witnesses.
 */
export async function sendPczt(
  wallet: WalletData,
  send: SendRequest,
  ufvk: string,
  account: { seedFingerprint: string; hdIndex: number },
  changeIndex?: number,
) {
  const start = performance.now();
  const plan = await planSend(wallet, send);
  const planned = performance.now();
  const trees = await fetchTrees(plan);
  const fetched = performance.now();
  const pczt: Uint8Array = send_pczt(
    NETWORK,
    ufvk,
    account.seedFingerprint,
    account.hdIndex,
    wallet,
    request(send),
    trees,
    changeIndex,
  );
  const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  console.log(
    `[submit] building: plan ${secs(planned - start)}, trees ${secs(fetched - planned)}, pczt ${secs(performance.now() - fetched)}`,
  );
  return { pczt, plan };
}

/** Plans shielding every transparent coin into Ironwood. */
export async function planShield(wallet: WalletData) {
  await init();
  return plan_shield(NETWORK, wallet) as SendPlan;
}

/** The unsigned PCZT shielding every transparent coin, and its plan. */
export async function shieldPczt(
  wallet: WalletData,
  ufvk: string,
  account: { seedFingerprint: string; hdIndex: number },
) {
  const plan = await planShield(wallet);
  const trees = await fetchTrees(plan);
  const pczt: Uint8Array = shield_pczt(
    NETWORK,
    ufvk,
    account.seedFingerprint,
    account.hdIndex,
    wallet,
    trees,
  );
  return { pczt, plan };
}
