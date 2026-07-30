import { dedupe, singleton } from "../utils";
import { crawlChunks } from "./crawl";
import {
  emptySyncStatus,
  loadNotes,
  loadSyncStatus,
  saveSyncState,
  type SyncStatus,
} from "./db";
import { type ChunksData, fetchChunks } from "./indexer";
import type { ChunkWorkerSuccess, Note, Pool } from "./types";

export type SyncEventListener = (e: { percentage: number }) => void;

const POOLS = ["orchard", "sapling"] as const satisfies Pool[];

const percentageOf = (scanned: SyncStatus["scanned"], chunks: ChunksData) => {
  const done = POOLS.reduce(
    (sum, p) => sum + Math.max(0, scanned[p].to - scanned[p].from + 1),
    0,
  );
  const total = POOLS.reduce(
    (sum, p) => sum + chunks[p].last_chunk - chunks[p].first_chunk + 1,
    0,
  );
  return total > 0 ? Math.min(100, (done / total) * 100) : 100;
};

export class ZWallet {
  readonly id: string;
  readonly #ufvk: string;

  #notes: Note[] = [];
  #unspentNotes: Map<string, Note> = new Map();
  #syncStatus: SyncStatus;
  #syncProgressListeners: Set<SyncEventListener> = new Set();
  #abort = new AbortController();
  /** Saves are chained so two overlapping writes can't reorder the sync tip. */
  #saving: Promise<unknown> = Promise.resolve();

  constructor(options: { id: string; ufvk: string }) {
    this.id = options.id;
    this.#ufvk = options.ufvk;
    this.#syncStatus = emptySyncStatus(this.id);
    this.#seed();
  }

  free = () => {
    this.#abort.abort();
    this.#syncProgressListeners.clear();
  };

  #seed = singleton(async () => {
    const [notes, syncStatus] = await Promise.all([
      loadNotes(this.id),
      loadSyncStatus(this.id),
    ]);

    this.#notes = notes;
    this.#syncStatus = syncStatus;
    for (const note of notes) {
      if (!note.spent) this.#unspentNotes.set(note.nf_mine, note);
    }
  });

  subscribeSyncProgress = (listener: SyncEventListener) => {
    this.#syncProgressListeners.add(listener);
    return () => {
      this.#syncProgressListeners.delete(listener);
    };
  };

  #emitProgress = () => {
    const { percentage } = this.#syncStatus;
    this.#syncProgressListeners.forEach((listener) => listener({ percentage }));
  };

  sync = dedupe(async () => {
    const startTime = Date.now();
    await this.#seed();
    this.#emitProgress();

    const chunks = await fetchChunks();

    for (const pool of POOLS) {
      const { first_chunk, last_chunk } = chunks[pool];
      const scanned = this.#syncStatus.scanned[pool];

      // An untouched wallet starts with an empty window pinned at the tip, so
      // the whole history falls to the downward crawl below.
      if (scanned.to < scanned.from) {
        scanned.from = last_chunk + 1;
        scanned.to = last_chunk;
      }

      // Chunks minted since the last sync. Crawled downward like everything
      // else, so the window's top only moves once the whole range has landed.
      await crawlChunks({
        ufvk: this.#ufvk,
        pool,
        from: last_chunk,
        to: scanned.to + 1,
        signal: this.#abort.signal,
        onChunk: (result) => this.#applyChunk(pool, result, chunks),
      });
      if (this.#abort.signal.aborted) break;
      scanned.to = last_chunk;
      this.#advance(chunks);

      // The unscanned history below the window, newest chunk first.
      await crawlChunks({
        ufvk: this.#ufvk,
        pool,
        from: scanned.from - 1,
        to: first_chunk,
        signal: this.#abort.signal,
        onChunk: (result) => {
          scanned.from = result.chunk;
          this.#applyChunk(pool, result, chunks);
        },
      });
    }

    await this.#saving;
    console.log("[sync] took (seconds):", (Date.now() - startTime) / 1000);
  });

  /** Applies one chunk's notes and spends, then persists and announces progress. */
  #applyChunk = (
    pool: Pool,
    { chunk, hits, spends }: ChunkWorkerSuccess,
    chunks: ChunksData,
  ) => {
    hits.forEach((hit, i) => {
      const note: Note = {
        ...hit,
        id: `${this.id}_${pool}_${chunk}_${i}`,
        spent: false,
      };
      this.#notes.push(note);
      this.#unspentNotes.set(note.nf_mine, note);
    });

    // ponytail: crawling downward, a spend usually lands before the note it
    // spends, leaving that note marked unspent. Next step: keep the unmatched
    // nullifiers and reconcile them as the notes below come in.
    for (const nullifier of spends) {
      const note = this.#unspentNotes.get(nullifier);
      if (note) {
        note.spent = true;
        this.#unspentNotes.delete(nullifier);
      }
    }

    this.#advance(chunks);
  };

  /** Recomputes progress from the scanned window, then persists and announces it. */
  #advance = (chunks: ChunksData) => {
    this.#syncStatus.percentage = percentageOf(
      this.#syncStatus.scanned,
      chunks,
    );
    this.#save();
    this.#emitProgress();
  };

  // TODO persist only the notes that changed, instead of the whole set.
  #save = () => {
    const snapshot = {
      ...this.#syncStatus,
      scanned: structuredClone(this.#syncStatus.scanned),
    };
    this.#saving = this.#saving
      .then(() => saveSyncState(this.#notes, snapshot))
      .catch((err) => console.error("[sync] save failed", err));
  };

  async getBalance() {
    await this.sync();
    return {
      shieldedBalance: this.#notes.reduce(
        (sum, n) => sum + (n.spent ? 0n : BigInt(n.value)),
        0n,
      ),
      // TODO
      pendingChange: 0n,
      pendingSpendable: 0n,
      unshieldedBalance: 0n,
    };
  }

  async getTransactionHistory() {
    // TODO
    return [];
  }
}
