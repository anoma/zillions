import Dexie, { type EntityTable, type Table } from "dexie";

import type { Note } from "./types";

// export interface NoteRow extends Omit<CrawlHit, "spent"> {
//   accountId: string;
//   spent?: boolean; // |null se o undefind nao funfar
// }

type NoteRow = Note;

export type PoolSyncStatus = {
  lastReportedPercentage: number;
  lastScannedChunk: number;
};

export type SyncStatus_OLD = {
  sapling: PoolSyncStatus;
  orchard: PoolSyncStatus;
};

export interface SyncStatus {
  id: string;
  percentage: number;
  lastChunk: {
    sapling: number;
    orchard: number;
  };
}

export const db = new Dexie("zcrawler") as Dexie & {
  // TODO entender melhor essa sintaxe
  notes: Table<NoteRow, [string, string]>;
  sync: EntityTable<SyncStatus, "id">;
};

db.version(2).stores({
  // notes: "[accountId+position]",
  // TODO preciso especificar os campos?
  // TODO posso salvar os blobs encryptados?
  // aí teria q decryptar todo boot
  // o valor final não seria um obj, seria apenas um blob
  // depois eu crio uma layer nisso
  // notes: "[accountId+position]",
  notes: "id",
  sync: "id",
});

/** Persist one chunk's delta atomically: new notes, resolved spends, progress. */
export function persistDelta(
  accountId: string,
  notes: NoteRow[],
  spent: string[],
  scannedTo: number,
): Promise<void> {
  return db.transaction("rw", db.notes, db.sync, async () => {
    if (notes.length) await db.notes.bulkPut(notes);
    if (spent.length) {
      await db.notes
        .where("[accountId+nf_mine]")
        .anyOf(spent.map((nf) => [accountId, nf]))
        .modify({ spent: 1 });
    }
    // Chunks land out of order, so concurrent writers can compute frontiers in
    // any order; a high-water mark that moves backwards would skip blocks.
    const current = (await db.sync.get(accountId))?.lastScannedBlock ?? -1;
    if (scannedTo > current) {
      await db.sync.put({ accountId, lastScannedBlock: scannedTo });
    }
  });
}

export const getUnspentNotes = (accountId: string): Promise<NoteRow[]> =>
  db.notes.where("[accountId+position]").startsWith(accountId).toArray();

/** Streams the index rather than materializing every note. */
export async function spendableValue(accountId: string): Promise<number> {
  let total = 0;
  await db.notes
    .where("[accountId+spent]")
    .equals([accountId, 0])
    .each((n) => {
      total += n.value;
    });
  return total;
}

export const resumeFrom = async (
  accountId: string,
  activationHeight: number,
): Promise<number> =>
  (await db.sync.get(accountId))?.lastScannedBlock ?? activationHeight;

export { db as zcrawlerDb };
