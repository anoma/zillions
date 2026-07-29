import { db, type SyncStatus } from "./db";
import type { Note } from "./types";

export const emptySyncStatus: SyncStatus = {
  id: "",
  percentage: 0,
  lastChunk: {
    sapling: -1,
    orchard: -1,
  },
};

export class Persister {
  #accountId: string;

  constructor(accountId: string) {
    this.#accountId = accountId;
  }

  getNotes = async (): Promise<Note[]> => {
    return db.notes.where("id").startsWith(this.#accountId).toArray();
  };

  getSyncStatus = async (): Promise<SyncStatus> => {
    return (await db.sync.get(this.#accountId)) ?? emptySyncStatus;
  };

  onSyncUpdate = (notes: Note[], syncStatus: SyncStatus) => {
    return db.transaction("rw", db.notes, db.sync, async () => {
      if (notes.length) {
        await db.notes.bulkPut(notes);
      }
      await db.sync.put(syncStatus);
    });
  };
}
