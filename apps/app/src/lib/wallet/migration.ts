/**
 * A migration in progress (product.md 2.9, docs/design/migration.md): the
 * plan saved at review and what each step sent. The user sends each step;
 * which one is next follows from the plan, the account's Orchard notes and
 * what's still pending.
 */

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

/** Blocks between ZIP 318 bucket boundaries. */
const BUCKET = 144;
/** Upstream's trusted confirmations: an anchor sits this far below the target. */
const TRUSTED = 3;

/**
 * The tip from which a note mined at `height` can be spent at a bucket
 * anchor: the youngest one a transaction may take is a bucket below the
 * newest boundary under the confirmations, and must be at or above the note.
 * zcore's `anchorable` counts the same way.
 */
export const readyAt = (height: number) =>
  Math.ceil(height / BUCKET) * BUCKET + BUCKET + TRUSTED - 1;

/** An unspent Orchard note, as the next step needs it. */
export type OrchardNote = { value: number; height: number };

/**
 * Each step carries `height`, when the plan has it due, and `readyAt`, the
 * tip from which its notes can anchor and it can be sent at all.
 */
export type Step = { index: number; height: number; readyAt: number } &
  /** Makes notes for `parts`, the transfers that have none yet. */
  (| { kind: "preparation"; parts: number[] }
    /**
     * Spends a note worth `value` and the transfer fee, or with `exact` false
     * any Orchard note that covers it (a plan with no preparation).
     */
    | { kind: "transfer"; value: number; exact: boolean }
  );

export type Next =
  | Step
  /** A step sent is still being mined; the next one may need its notes. */
  | { kind: "mining" }
  /** The notes the plan needs are gone, spent elsewhere: plan again. */
  | { kind: "replan" }
  | { kind: "done" };

/**
 * The step to send next, from the account's unspent Orchard notes and the
 * txids still pending. A transfer whose note exists goes next; otherwise the
 * next preparation makes notes for every transfer that has none.
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
  const unsent = m.transfers
    .map((t, index) => ({ ...t, index }))
    .filter((t) => !t.txid);
  if (!unsent.length) return { kind: "done" };

  // Oldest first: a transfer takes the first of its notes to be ready.
  const notes = [...orchard].sort((a, b) => a.height - b.height);
  const earliest = (of: OrchardNote[]) =>
    Math.min(...of.map((n) => readyAt(n.height)));
  const funding = new Map<number, OrchardNote>();
  const unfunded = unsent.filter((t) => {
    const at = notes.findIndex((n) => n.value === t.value + m.transferFee);
    if (at < 0) return true;
    funding.set(t.index, notes.splice(at, 1)[0]);
    return false;
  });
  const transfer = (t: (typeof unsent)[number], exact: boolean): Step => ({
    kind: "transfer",
    index: t.index,
    height: t.height,
    value: t.value,
    exact,
    readyAt: exact
      ? readyAt(funding.get(t.index)!.height)
      : earliest(orchard.filter((n) => n.value >= t.value + m.transferFee)),
  });
  if (!unfunded.length) return transfer(unsent[0], true);

  const index = m.preparations.findIndex((p) => !p.txid);
  if (index >= 0) {
    return {
      kind: "preparation",
      index,
      height: m.preparations[index].height,
      parts: unfunded.map((t) => t.value),
      readyAt: earliest(orchard),
    };
  }
  if (!m.preparations.length && unsent.length === 1) {
    return transfer(unsent[0], false);
  }
  return { kind: "replan" };
}

/**
 * Records step `index` of `kind` sent as `txid` at `tip`. Sent late, it
 * shifts every step not yet sent by as much, as ZIP 318 asks, so the gaps
 * between them stay drawn and a wallet opened late sends one overdue step,
 * not a burst. Sent early, the rest stay as planned.
 */
export function stepSent(
  m: Migration,
  kind: "preparation" | "transfer",
  index: number,
  txid: string,
  tip: number,
) {
  const step = (kind === "preparation" ? m.preparations : m.transfers)[index];
  const late = Math.max(0, tip - step.height);
  step.txid = txid;
  for (const s of [...m.preparations, ...m.transfers]) {
    if (!s.txid) s.height += late;
  }
}

/** What a step is called, as the steps list names it. */
export const stepName = (step: Step) =>
  step.kind === "preparation"
    ? "the preparation"
    : `transfer ${step.index + 1}`;

/** Transfers sent and mined. */
export const transfersDone = (m: Migration, pending: Set<string>) =>
  m.transfers.filter((t) => t.txid && !pending.has(t.txid)).length;
