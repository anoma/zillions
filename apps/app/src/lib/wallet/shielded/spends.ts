/**
 * Which of our notes were spent, and where. Orchard and Ironwood spends sit
 * in the chunks the crawl reads; Sapling ones are only in the indexer's
 * nullifier chunks, which say that a note was spent but not where.
 */

import { find_spends, nullifiers_spent } from "@zillions/zcore";
import { fetchNullifierChunk } from "../chain/indexer";
import type { Block } from "../chain/lightwalletd";
import type { Note, Pool, ShieldedScan, SpendPlace } from "../types";

/** Notes' nullifiers as zcore takes them: 32 bytes each, back to back. */
export const packNullifiers = (notes: Note[]) =>
  Uint8Array.from(
    notes.flatMap((n) => n.nf_mine.match(/../g)!.map((b) => parseInt(b, 16))),
  );

/** Records of a `/ciphertexts` chunk `body` spending `pool` notes not placed yet, by index. */
export function findSpends(notes: Note[], pool: Pool, body: Uint8Array) {
  const ours = notes.filter(
    (n) => n.pool === pool && !(n.spend.status === "spent" && n.spend.at),
  );
  return ours.length ? [...find_spends(pool, body, packNullifiers(ours))] : [];
}

/** Marks the `pool` notes `places` name as spent there. */
export function placeSpends(notes: Note[], pool: Pool, places: SpendPlace[]) {
  for (const { nf, height, tx_index } of places) {
    const note = notes.find((n) => n.pool === pool && n.nf_mine === nf);
    if (note) note.spend = { status: "spent", at: { height, tx_index } };
  }
}

/** Marks `pool` notes still unchecked as unspent: the sync has read to the tip. */
export function markUnspent(notes: Note[], pool: Pool) {
  for (const note of notes) {
    if (note.pool === pool && note.spend.status === "unchecked") {
      note.spend = { status: "unspent" };
    }
  }
}

/**
 * Checks Sapling notes against the nullifier chunks from the first one
 * `scan` hasn't checked, and moves it past every full chunk read. Stops
 * early, changing nothing more, once `signal` aborts.
 */
export async function checkSaplingSpends(
  notes: Note[],
  scan: ShieldedScan,
  signal: AbortSignal,
) {
  const unchecked = () =>
    notes.filter((n) => n.pool === "sapling" && n.spend.status !== "spent");
  if (!unchecked().length) return;
  for (let chunk = scan.saplingNullifiers; ; chunk++) {
    if (signal.aborted) return;
    const body = await fetchNullifierChunk("sapling", chunk);
    if (!body) break;
    const ours = unchecked();
    const { spent, frozen } = nullifiers_spent(body, packNullifiers(ours)) as {
      spent: number[];
      frozen: boolean;
    };
    for (const i of spent) ours[i].spend = { status: "spent" };
    if (!frozen) break;
    // A full chunk never changes, so it's never read again.
    scan.saplingNullifiers = chunk + 1;
  }
  for (const note of unchecked()) note.spend = { status: "unspent" };
}

/**
 * Places each Sapling spend in a transaction of ours, from the Sapling
 * nullifiers in `blocks`. One in a transaction with nothing else of ours
 * stays spent with no place.
 */
export function locateSaplingSpends(notes: Note[], blocks: Map<number, Block>) {
  for (const note of notes) {
    if (note.pool !== "sapling" || note.spend.status !== "spent") continue;
    if (note.spend.at) continue;
    for (const [height, block] of blocks) {
      const tx_index =
        height >= note.height
          ? block.saplingSpends.get(note.nf_mine)
          : undefined;
      if (tx_index !== undefined) {
        note.spend = { status: "spent", at: { height, tx_index } };
        break;
      }
    }
  }
}
