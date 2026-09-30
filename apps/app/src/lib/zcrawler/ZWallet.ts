import { dedupe, singleton } from "../utils";
import { crawlChunks } from "./crawl";
import { loadNotes, loadSent, loadSyncStatus, saveSyncState } from "./db";
import { buildHistory, historyHeights } from "./history";
import { type ChunksData, fetchChunks, fetchNullifiers } from "./indexer";
import { type Block, fetchBlock, type Utxo } from "./lightwalletd";
import { syncTransparent, type TransparentTx } from "./transparent";
import type { ChunkWorkerSuccess, Note, Pool, Sent, SyncStatus } from "./types";

export type SyncEventListener = (e: { percentage: number }) => void;

/** Newest pool first: that's where recent activity lands. */
const POOLS = ["ironwood", "orchard", "sapling"] as const satisfies Pool[];

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

const emptySyncStatus = (accountId: string): SyncStatus => ({
  id: accountId,
  percentage: 0,
  scanned: {
    ironwood: { from: 0, to: -1 },
    orchard: { from: 0, to: -1 },
    sapling: { from: 0, to: -1 },
  },
});

export class ZWallet {
  readonly id: string;
  readonly #ufvk: string;
  /** Block height below which nothing is crawled. Absent means full history. */
  readonly #birthday?: number;

  #notes: Note[] = [];
  #sent: Sent[] = [];
  #unspentNotes: Map<string, Note> = new Map();
  /** Note and sent-output ids already held, so a re-read chunk can't double them. */
  #applied: Set<string> = new Set();
  #syncStatus: SyncStatus;
  /** The transparent side, rebuilt whole each sync. */
  #transparent: { utxos: Utxo[]; txs: TransparentTx[] } = {
    utxos: [],
    txs: [],
  };
  /** Blocks history names, for their txids and times. They never change. */
  #blocks: Map<number, Block> = new Map();
  #syncProgressListeners: Set<SyncEventListener> = new Set();
  #abort = new AbortController();
  /** Saves are chained so two overlapping writes can't reorder the sync tip. */
  #saving: Promise<unknown> = Promise.resolve();
  /** Spend lookups are chained: one bucket in flight, newest notes first. */
  #checking: Promise<unknown> = Promise.resolve();

  constructor(options: { id: string; ufvk: string; birthday?: number }) {
    this.id = options.id;
    this.#ufvk = options.ufvk;
    this.#birthday = options.birthday;
    this.#syncStatus = emptySyncStatus(this.id);
    this.#seed();
  }

  free = () => {
    this.#abort.abort();
    this.#syncProgressListeners.clear();
  };

  #seed = singleton(async () => {
    // TODO review if we should have a unified method to load the whole wallet
    const [notes, sent, syncStatus] = await Promise.all([
      loadNotes(this.id),
      loadSent(this.id),
      loadSyncStatus(this.id),
    ]);
    this.#notes = notes;
    this.#sent = sent;
    if (syncStatus) {
      this.#syncStatus = syncStatus;
    }
    for (const note of notes) {
      this.#applied.add(note.id);
      if (!note.spent) this.#unspentNotes.set(note.nf_mine, note);
    }
    for (const out of sent) this.#applied.add(out.id);
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

    // Transparent takes seconds, so it lands long before the shielded crawl;
    // announcing it on arrival shows that balance straight away.
    const transparent = syncTransparent(this.#ufvk)
      .then((result) => {
        this.#transparent = result;
        this.#emitProgress();
      })
      .catch((err) => console.error("[sync] transparent failed", err));

    // Notes carried over from an earlier sync may have been spent since. Kicked
    // off first so the bucket lookups overlap the crawl.
    this.#checkSpends([...this.#unspentNotes.values()]);

    // History's blocks are looked up whatever becomes of the crawl: what it
    // did find, and the transparent side, still deserve their txids and times.
    try {
      const chunks = await fetchChunks();
      for (const pool of POOLS) {
        const { first_chunk, last_chunk } = chunks[pool];
        if (last_chunk < first_chunk) continue;
        const scanned = this.#syncStatus.scanned[pool];

        // An untouched wallet starts with an empty window pinned at the tip, so
        // the whole history falls to the downward crawl below.
        if (scanned.to < scanned.from) {
          scanned.from = last_chunk + 1;
          scanned.to = last_chunk;
        }

        // Chunks minted since the last sync, plus the window's top chunk again:
        // it may have been the tip, still filling, when it was read. Crawled
        // downward like everything else, so the window's top only moves once the
        // whole range has landed.
        await crawlChunks({
          ufvk: this.#ufvk,
          pool,
          from: last_chunk,
          to: scanned.to,
          signal: this.#abort.signal,
          onChunk: (result) => this.#applyChunk(pool, result, chunks),
        });
        if (this.#abort.signal.aborted) break;
        scanned.to = last_chunk;
        this.#advance(chunks);

        // The unscanned history below the window, newest chunk first, down to
        // the first chunk that starts before the birthday: every chunk below it
        // is older still.
        const floor = new AbortController();
        await crawlChunks({
          ufvk: this.#ufvk,
          pool,
          from: scanned.from - 1,
          to: first_chunk,
          signal: AbortSignal.any([this.#abort.signal, floor.signal]),
          onChunk: (result) => {
            if (floor.signal.aborted) return;
            scanned.from = result.chunk;
            this.#applyChunk(pool, result, chunks);
            if (
              this.#birthday !== undefined &&
              result.minHeight < this.#birthday
            ) {
              scanned.from = first_chunk;
              floor.abort();
              this.#advance(chunks);
            }
          },
        });
      }
    } finally {
      await transparent;
      await this.#checking;
      await this.#fetchBlocks();
      await this.#saving;
      console.log("[sync] took (seconds):", (Date.now() - startTime) / 1000);
    }
  });

  /** Applies one chunk's notes, then persists and announces progress. */
  #applyChunk = (
    pool: Pool,
    { hits, sent }: ChunkWorkerSuccess,
    chunks: ChunksData,
  ) => {
    for (const out of sent) {
      const id = `${this.id}_${pool}_${out.position}`;
      if (this.#applied.has(id)) continue;
      this.#applied.add(id);
      this.#sent.push({ ...out, id });
    }

    const found = hits.flatMap((hit) => {
      const note: Note = {
        ...hit,
        id: `${this.id}_${pool}_${hit.position}`,
        spent: undefined,
      };
      if (this.#applied.has(note.id)) return [];
      this.#applied.add(note.id);
      this.#notes.push(note);
      this.#unspentNotes.set(note.nf_mine, note);
      return note;
    });

    this.#checkSpends(found);
    this.#advance(chunks);
  };

  /**
   * Resolves spentness by asking the indexer for each note's nullifier bucket.
   * Runs off the crawl (`#applyChunk` must stay synchronous) and chained, so a
   * long crawl can't fan out into a request per note all at once.
   */
  #checkSpends = (notes: Note[]) => {
    if (!notes.length) return;
    this.#checking = this.#checking
      .then(async () => {
        for (const note of notes) {
          if (this.#abort.signal.aborted) return;
          const bucket = await fetchNullifiers(note.nf_mine, note.pool);
          // The indexer keeps only a nullifier's leading bytes, and its hex
          // case must not decide the match; `nf_mine` is lowercase.
          const spend = bucket.find(({ nf_tag }) =>
            note.nf_mine.startsWith(nf_tag.toLowerCase()),
          );
          note.spent = spend
            ? { height: spend.height, tx_index: spend.tx_index }
            : false;
          if (note.spent) {
            this.#unspentNotes.delete(note.nf_mine);
          }
        }
        this.#save();
        this.#emitProgress();
      })
      .catch((err) => console.error("[sync] spend check failed", err));
  };

  /**
   * Fetches the blocks behind every transaction in history, once each: they
   * give shielded transactions their txids, which is what lets a transaction
   * seen from both sides show once, and every entry its time.
   */
  #fetchBlocks = async () => {
    const heights = [
      ...historyHeights(this.#notes, this.#sent, this.#transparent.txs),
    ].filter((height) => !this.#blocks.has(height));
    // A block that fails is simply asked for again next sync.
    const blocks = await Promise.allSettled(heights.map(fetchBlock));
    blocks.forEach((block, i) => {
      if (block.status === "fulfilled")
        this.#blocks.set(heights[i], block.value);
      else
        console.error("[sync] block lookup failed", heights[i], block.reason);
    });
    this.#emitProgress();
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
    console.log("[sync] persisting notes:", this.#notes.length);
    const snapshot = {
      ...this.#syncStatus,
      scanned: structuredClone(this.#syncStatus.scanned),
    };
    this.#saving = this.#saving
      // TODO review if it's safe to persist the note.nf_mine.
      // Otherwise we need to compute them during the seed phase.
      // The sync phase already compute them in memory only.
      .then(() => saveSyncState(this.#notes, this.#sent, snapshot))
      .catch((err) => console.error("[sync] save failed", err));
  };

  async getBalance() {
    return {
      shieldedBalance: this.#notes.reduce(
        (sum, n) => sum + (n.spent === false ? BigInt(n.value) : 0n),
        0n,
      ),
      // TODO
      pendingChange: 0n,
      pendingSpendable: 0n,
      unshieldedBalance: this.#transparent.utxos.reduce(
        (sum, utxo) => sum + BigInt(utxo.value),
        0n,
      ),
    };
  }

  async getTransactionHistory() {
    return buildHistory(
      this.#notes,
      this.#sent,
      this.#transparent.txs,
      this.#blocks,
    );
  }
}
