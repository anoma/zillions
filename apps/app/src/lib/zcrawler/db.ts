import Dexie, { type EntityTable, type Table } from "dexie";

import type { Note, Pool } from "./types";

export interface SyncStatus {
  id: string;
  percentage: number;
  lastChunk: Record<Pool, number>;
}

export const db = new Dexie("zcrawler") as Dexie & {
  notes: Table<Note, string>;
  sync: EntityTable<SyncStatus, "id">;
};

db.version(2).stores({
  notes: "id",
  sync: "id",
});

/** Chunk -1 means "nothing scanned yet"; chunk indexes start at 0. */
export const emptySyncStatus = (accountId: string): SyncStatus => ({
  id: accountId,
  percentage: 0,
  lastChunk: { sapling: -1, orchard: -1 },
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
