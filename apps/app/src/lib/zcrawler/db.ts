import Dexie, { type EntityTable, type Table } from "dexie";

import type { Note, Pool } from "./types";

/** The contiguous chunk range already scanned for a pool; `to < from` is empty. */
export interface ChunkRange {
  from: number;
  to: number;
}

export interface SyncStatus {
  id: string;
  percentage: number;
  scanned: Record<Pool, ChunkRange>;
}

export const db = new Dexie("zcrawler") as Dexie & {
  notes: Table<Note, string>;
  sync: EntityTable<SyncStatus, "id">;
};

db.version(2).stores({
  notes: "id",
  sync: "id",
});

// Sync state is dropped: pre-v3 rows track an upward cursor that says nothing
// about what a downward crawl still has to cover.
db.version(3)
  .stores({
    notes: "id",
    sync: "id",
  })
  .upgrade((tx) => tx.table("sync").clear());

export const emptySyncStatus = (accountId: string): SyncStatus => ({
  id: accountId,
  percentage: 0,
  scanned: { sapling: { from: 0, to: -1 }, orchard: { from: 0, to: -1 } },
});

export const loadNotes = (accountId: string): Promise<Note[]> =>
  db.notes.where("id").startsWith(accountId).toArray();

export const loadSyncStatus = async (accountId: string): Promise<SyncStatus> =>
  (await db.sync.get(accountId)) ?? emptySyncStatus(accountId);

export const saveSyncState = (notes: Note[], syncStatus: SyncStatus) =>
  db.transaction("rw", db.notes, db.sync, async () => {
    if (notes.length) await db.notes.bulkPut(notes);
    await db.sync.put(syncStatus);
  });
