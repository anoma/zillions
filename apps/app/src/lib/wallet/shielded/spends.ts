/**
 * Which of our notes were spent, and where. Newest-first, a note's spend is
 * read before the note is found, so the indexer looks up its nullifier.
 * ponytail: tells the indexer which nullifiers are ours; temporary until it
 * offers a private lookup.
 */

import { fetchSpent, SPENT_BATCH } from "../chain/indexer";
import type { Note } from "../types";

/** Notes' nullifiers as the indexer takes them: 32 bytes each, back to back. */
export const packNullifiers = (notes: Note[]) =>
  Uint8Array.from(
    notes.flatMap((n) => n.nf_mine.match(/../g)!.map((b) => parseInt(b, 16))),
  );

/** Marks each of `notes` spent where the indexer saw its nullifier, or unspent. Stops early once `signal` aborts. */
export async function checkSpends(notes: Note[], signal: AbortSignal) {
  for (const pool of new Set(notes.map((n) => n.pool))) {
    const ours = notes.filter((n) => n.pool === pool);
    for (let i = 0; i < ours.length; i += SPENT_BATCH) {
      if (signal.aborted) return;
      const batch = ours.slice(i, i + SPENT_BATCH);
      const places = await fetchSpent(pool, packNullifiers(batch));
      batch.forEach((note, j) => {
        const at = places[j];
        note.spend = at ? { status: "spent", at } : { status: "unspent" };
      });
    }
  }
}
