/** A migration in progress (product.md 2.9, docs/design/migration.md): the plan saved at review and what each step sent. */

import { NU7 } from "./chain/blockTime";
import type { MigrationPlan } from "./send";

type Sent = { height: number; txid?: string };

export type Migration = {
  /** The tip the plan's heights count from. */
  tip: number;
  transferFee: number;
  preparationFee: number;
  left: number;
  preparations: Sent[];
  transfers: (Sent & { value: number })[];
};

export const startMigration = (plan: MigrationPlan): Migration => ({
  tip: plan.tip,
  transferFee: plan.transferFee,
  preparationFee: plan.preparationFee,
  left: plan.left,
  preparations: plan.preparations.map((height) => ({ height })),
  transfers: plan.transfers.map(({ value, height }) => ({ value, height })),
});

/** Blocks between ZIP 318 bucket boundaries; NU7 triples them, to keep them as far apart in time. */
const bucket = (height: number) => (height < NU7 ? 144 : 432);
/** zcore's trusted confirmations: an anchor sits this far below the target. */
const TRUSTED = 1;

/** The first bucket boundary at or above `height`, as upstream's `AnchorGrid`. */
const boundary = (height: number): number => {
  const above = Math.ceil(height / bucket(height)) * bucket(height);
  return height < NU7 && above >= NU7 ? boundary(NU7) : above;
};

/** The tip from which a note mined at `height` can be spent at a bucket anchor, as zcore's `anchorable` counts. */
export const readyAt = (height: number) =>
  boundary(boundary(height) + 1) + TRUSTED - 1;

export type OrchardNote = { value: number; height: number };

/** `height` is when the plan has the step due; `readyAt`, the tip from which its notes can anchor. */
export type Step = { index: number; height: number; readyAt: number } &
  /** Makes notes for `parts`, the transfers that have none yet. */
  (
    | { kind: "preparation"; parts: number[] }
    /** Spends the note worth `value` and the transfer fee. */
    | { kind: "transfer"; value: number }
  );

export type Next =
  | Step
  /** A step sent is still being mined; the next one may need its notes. */
  | { kind: "mining" }
  /** The notes the plan needs are gone, spent elsewhere: plan again. */
  | { kind: "replan" }
  | { kind: "done" };

/**
 * The transfers still to send, the note each one has (`funding`), and
 * `spare`: the notes none of them waits for.
 */
function funded<N extends OrchardNote>(m: Migration, orchard: N[]) {
  const unsent = m.transfers
    .map((t, index) => ({ ...t, index }))
    .filter((t) => !t.txid);
  // Oldest first: a transfer takes the first of its notes to be ready.
  const spare = [...orchard].sort((a, b) => a.height - b.height);
  const funding = new Map<number, N>();
  const unfunded = unsent.filter((t) => {
    const at = spare.findIndex((n) => n.value === t.value + m.transferFee);
    if (at < 0) return true;
    funding.set(t.index, spare.splice(at, 1)[0]);
    return false;
  });
  return { unsent, funding, unfunded, spare };
}

/**
 * The notes a preparation may spend. A transfer still to send keeps the note
 * made for it: spent again, no preparation would be left to remake it.
 */
export const spareNotes = <N extends OrchardNote>(m: Migration, orchard: N[]) =>
  funded(m, orchard).spare;

/**
 * The step to send next: a transfer whose note exists, else the preparation
 * making notes for every transfer that has none.
 */
// ponytail: a step that expired unmined counts as sent; ZIP 318's expiry is
// a month out. Track expiry here if that ever bites.
export function nextStep(
  m: Migration,
  orchard: OrchardNote[],
  pending: Set<string>,
): Next {
  const steps = [...m.preparations, ...m.transfers];
  if (steps.some((s) => s.txid && pending.has(s.txid))) {
    return { kind: "mining" };
  }
  const { unsent, funding, unfunded, spare } = funded(m, orchard);
  if (!unsent.length) return { kind: "done" };

  if (!unfunded.length) {
    const [t] = unsent;
    return {
      kind: "transfer",
      index: t.index,
      height: t.height,
      value: t.value,
      readyAt: readyAt(funding.get(t.index)!.height),
    };
  }

  const index = m.preparations.findIndex((p) => !p.txid);
  if (index >= 0 && spare.length) {
    return {
      kind: "preparation",
      index,
      height: m.preparations[index].height,
      parts: unfunded.map((t) => t.value),
      readyAt: Math.min(...spare.map((n) => readyAt(n.height))),
    };
  }
  return { kind: "replan" };
}

/**
 * Records a step sent as `txid` at `tip`. Sent late, it shifts every unsent
 * step by as much (ZIP 318), so a late wallet sends one overdue step, not a burst.
 */
export function stepSent(
  m: Migration,
  kind: "preparation" | "transfer",
  index: number,
  txid: string,
  tip: number,
) {
  const step = (kind === "preparation" ? m.preparations : m.transfers)[index];
  const late = Math.max(0, tip + 1 - step.height);
  step.txid = txid;
  for (const s of [...m.preparations, ...m.transfers]) {
    if (!s.txid) s.height += late;
  }
}

/** The block `step` is due in (one past the tip): the plan's, or the first its funds can anchor in, if later. */
export const sendAt = (step: Step) => Math.max(step.height, step.readyAt + 1);

export const isDue = (step: Step, tip: number) => tip + 1 >= sendAt(step);

/** Lowercase, for mid-sentence: "the preparation", "transfer 2". */
export const stepName = (step: Step) =>
  step.kind === "preparation"
    ? "the preparation"
    : `transfer ${step.index + 1}`;

/** Transfers sent and mined. */
export const transfersDone = (m: Migration, pending: Set<string>) =>
  m.transfers.filter((t) => t.txid && !pending.has(t.txid)).length;
