import Dexie, { type EntityTable, type Table } from "dexie";

import type { Block } from "./lightwalletd";
import type { TransparentCache } from "./transparent";
import type { Note, Sent, SyncStatus } from "./types";

type StoredBlock = Block & { height: number };

export const db = new Dexie("zcrawler") as Dexie & {
  notes: Table<Note, string>;
  sent: Table<Sent, string>;
  sync: EntityTable<SyncStatus, "id">;
  transparent: EntityTable<TransparentCache, "id">;
  blocks: EntityTable<StoredBlock, "height">;
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

// Notes are dropped again: pre-v5 rows carry a boolean `spent` with no locator,
// and outgoing outputs were never recovered at all.
db.version(5)
  .stores({
    notes: "id",
    sent: "id",
    sync: "id",
  })
  .upgrade(async (tx) => {
    await tx.table("notes").clear();
    await tx.table("sync").clear();
  });

db.version(6).stores({
  notes: "id",
  sent: "id",
  sync: "id",
  transparent: "id",
  blocks: "height",
});

// Synced state is dropped: v7 scans oldest-first from a start chunk, finds
// spends itself, and its blocks carry their Sapling spends.
db.version(7)
  .stores({
    notes: "id",
    sent: "id",
    sync: "id",
    transparent: "id",
    blocks: "height",
  })
  .upgrade(async (tx) => {
    await Promise.all(
      ["notes", "sent", "sync", "blocks"].map((t) => tx.table(t).clear()),
    );
  });

// Blocks are dropped: v8's also place each transaction's new notes.
db.version(8)
  .stores({
    notes: "id",
    sent: "id",
    sync: "id",
    transparent: "id",
    blocks: "height",
  })
  .upgrade(async (tx) => {
    await tx.table("blocks").clear();
    await tx
      .table("sync")
      .toCollection()
      .modify((status: SyncStatus) => {
        status.sendsRead ??= [];
        status.pending ??= [];
      });
  });

// Blocks are dropped: v9's also carry each transaction's transparent outputs.
db.version(9)
  .stores({
    notes: "id",
    sent: "id",
    sync: "id",
    transparent: "id",
    blocks: "height",
  })
  .upgrade((tx) => tx.table("blocks").clear());

export const loadNotes = (accountId: string): Promise<Note[]> =>
  db.notes.where("id").startsWith(accountId).toArray();

export const loadSent = (accountId: string): Promise<Sent[]> =>
  db.sent.where("id").startsWith(accountId).toArray();

export const loadSyncStatus = async (
  accountId: string,
): Promise<SyncStatus | undefined> => await db.sync.get(accountId);

export const saveSyncState = (
  notes: Note[],
  sent: Sent[],
  syncStatus: SyncStatus,
) =>
  db.transaction("rw", db.notes, db.sent, db.sync, async () => {
    if (notes.length) await db.notes.bulkPut(notes);
    if (sent.length) await db.sent.bulkPut(sent);
    await db.sync.put(syncStatus);
  });

export const loadTransparent = (accountId: string) =>
  db.transparent.get(accountId);

/** Rewrites an account's transparent cache atomically, so a sync and an unshield never drop each other's writes. */
export const updateTransparent = (
  id: string,
  update: (cache: TransparentCache | undefined) => TransparentCache,
) =>
  db.transaction("rw", db.transparent, async () => {
    const next = update(await db.transparent.get(id));
    await db.transparent.put(next);
    return next;
  });

/** Blocks are the chain's, not an account's: every account shares them. */
export const loadBlocks = (heights: number[]) => db.blocks.bulkGet(heights);

export const saveBlocks = (blocks: StoredBlock[]) => db.blocks.bulkPut(blocks);
