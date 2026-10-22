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

export type Step =
  /** Makes notes for `parts`, the transfers that have none yet. */
  | { kind: "preparation"; index: number; height: number; parts: number[] }
  /**
   * Spends a note worth `value` and the transfer fee, or with `exact` false
   * any Orchard note that covers it (a plan with no preparation).
   */
  | {
      kind: "transfer";
      index: number;
      height: number;
      value: number;
      exact: boolean;
    };

export type Next =
  | Step
  /** A step sent is still being mined; the next one may need its notes. */
  | { kind: "mining" }
  /** The notes the plan needs are gone, spent elsewhere: plan again. */
  | { kind: "replan" }
  | { kind: "done" };

/**
 * The step to send next, from the account's unspent Orchard note values and
 * the txids still pending. A transfer whose note exists goes next; otherwise
 * the next preparation makes notes for every transfer that has none.
 */
// ponytail: a step that expired unmined counts as sent; ZIP 318's expiry is
// a month out. Track expiry here if that ever bites.
export function nextStep(
  m: Migration,
  orchard: number[],
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

  const notes = [...orchard];
  const unfunded = unsent.filter((t) => {
    const at = notes.indexOf(t.value + m.transferFee);
    if (at < 0) return true;
    notes.splice(at, 1);
    return false;
  });
  const transfer = (t: (typeof unsent)[number], exact: boolean): Step => ({
    kind: "transfer",
    index: t.index,
    height: t.height,
    value: t.value,
    exact,
  });
  if (!unfunded.length) return transfer(unsent[0], true);

  const index = m.preparations.findIndex((p) => !p.txid);
  if (index >= 0) {
    return {
      kind: "preparation",
      index,
      height: m.preparations[index].height,
      parts: unfunded.map((t) => t.value),
    };
  }
  if (!m.preparations.length && unsent.length === 1) {
    return transfer(unsent[0], false);
  }
  return { kind: "replan" };
}

/** Transfers sent and mined. */
export const transfersDone = (m: Migration, pending: Set<string>) =>
  m.transfers.filter((t) => t.txid && !pending.has(t.txid)).length;
