import Dexie, { type EntityTable, type Table } from "dexie";

import type { Note, SyncStatus } from "./types";

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

// Notes are dropped too: pre-v4 rows were written from compact data alone and
// carry none of the fields full decryption adds.
db.version(4)
  .stores({
    notes: "id",
    sync: "id",
  })
  .upgrade(async (tx) => {
    await tx.table("notes").clear();
    await tx.table("sync").clear();
  });

export const loadNotes = (accountId: string): Promise<Note[]> =>
  db.notes.where("id").startsWith(accountId).toArray();

export const loadSyncStatus = async (
  accountId: string,
): Promise<SyncStatus | undefined> => await db.sync.get(accountId);

export const saveSyncState = (notes: Note[], syncStatus: SyncStatus) =>
  db.transaction("rw", db.notes, db.sync, async () => {
    if (notes.length) await db.notes.bulkPut(notes);
    await db.sync.put(syncStatus);
  });
