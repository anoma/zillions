import { dedupe, singleton } from "../utils";
import { crawlChunks } from "./crawl";
import {
  emptySyncStatus,
  loadNotes,
  loadSyncStatus,
  saveSyncState,
  type SyncStatus,
} from "./db";
import { fetchChunks } from "./indexer";
import type { ChunkWorkerSuccess, Note, Pool } from "./types";

export type SyncEventListener = (e: { percentage: number }) => void;

const POOLS = ["orchard", "sapling"] as const satisfies Pool[];

type ChunkTips = Record<Pool, number>;

/** Chunks are 0-indexed and `lastChunk` is -1 before anything is scanned. */
const percentageOf = (lastChunk: ChunkTips, tips: ChunkTips) => {
  const scanned = POOLS.reduce((sum, p) => sum + lastChunk[p] + 1, 0);
  const total = POOLS.reduce((sum, p) => sum + tips[p] + 1, 0);
  return total > 0 ? Math.min(100, (scanned / total) * 100) : 100;
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
    const tips: ChunkTips = {
      orchard: chunks.orchard.chunks,
      sapling: chunks.sapling.chunks,
    };

    for (const pool of POOLS) {
      await crawlChunks({
        ufvk: this.#ufvk,
        pool,
        from: this.#syncStatus.lastChunk[pool] + 1,
        to: tips[pool],
        signal: this.#abort.signal,
        onChunk: (result) => this.#applyChunk(pool, result, tips),
      });
    }

    // Covers the nothing-to-crawl case, where no chunk ever lands.
    if (!this.#abort.signal.aborted) this.#advance(tips);

    await this.#saving;
    console.log("[sync] took (seconds):", (Date.now() - startTime) / 1000);
  });

  /** Apply one in-order chunk into memory and advances the sync tip. */
  #applyChunk = (
    pool: Pool,
    { chunk, hits, spends }: ChunkWorkerSuccess,
    tips: ChunkTips,
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

    for (const nullifier of spends) {
      const note = this.#unspentNotes.get(nullifier);
      if (note) {
        note.spent = true;
        this.#unspentNotes.delete(nullifier);
      }
    }

    this.#syncStatus.lastChunk[pool] = chunk;
    this.#advance(tips);
  };

  /** Recomputes progress from the scanned tips, then persists and announces it. */
  #advance = (tips: ChunkTips) => {
    this.#syncStatus.percentage = percentageOf(
      this.#syncStatus.lastChunk,
      tips,
    );
    this.#save();
    this.#emitProgress();
  };

  // TODO persist only the notes that changed, instead of the whole set.
  #save = () => {
    const snapshot = {
      ...this.#syncStatus,
      lastChunk: { ...this.#syncStatus.lastChunk },
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
