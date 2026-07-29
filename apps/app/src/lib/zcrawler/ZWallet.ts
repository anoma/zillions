import { dedupe, singleton } from "../utils";
import type { SyncStatus } from "./db";
import { fetchChunks } from "./indexer";
import { emptySyncStatus, Persister } from "./persister";
import { serialQueue } from "./serialQueue";
import type {
  ChunkRequest,
  ChunkWorkerResponse,
  ChunkWorkerSuccess,
  Note,
} from "./types";
import ZcrawlerWorker from "./worker.ts?worker";

export type SyncEventListener = (e: { percentage: number }) => void;

export class ZWallet {
  readonly id: string;
  readonly #ufvk: string;
  readonly #persister: Persister;

  #notes: Note[] = [];
  #unspentNotesMap: Map<string, Note> = new Map();
  #syncStatus: SyncStatus = emptySyncStatus;
  #syncProgressListeners: Set<SyncEventListener> = new Set();

  constructor(options: { id: string; ufvk: string }) {
    this.id = options.id;
    this.#ufvk = options.ufvk;
    this.#persister = new Persister(this.id);
    this.#syncStatus.id = this.id;
    this.#seed();
  }

  free = () => {
    // TODO cancel sync and release everything
  };

  #seed = singleton(async () => {
    const [notes, syncStatus] = await Promise.all([
      this.#persister.getNotes(),
      this.#persister.getSyncStatus(),
    ]);

    this.#notes = notes;
    // TODO should we move to a local var in sync() of syncOnePool() function?
    this.#notes.forEach((note) => {
      if (!note.spent) {
        this.#unspentNotesMap.set(note.nf_mine, note);
      }
    });
    this.#syncStatus = syncStatus;
  });

  subscribeSyncProgress = (listener: SyncEventListener) => {
    this.#syncProgressListeners.add(listener);
    return () => {
      this.#syncProgressListeners.delete(listener);
    };
  };

  #emitEvent = () => {
    console.log("[sync]", this.#syncStatus.percentage);
    this.#syncProgressListeners.forEach((listener) =>
      listener({ percentage: this.#syncStatus.percentage }),
    );
  };

  sync = dedupe(async () => {
    const startTime = new Date();
    console.log("[sync] start:", startTime.toLocaleString());

    await this.#seed();

    if (this.#syncStatus.percentage >= 100) {
      this.#syncStatus.percentage = 0;
    }
    this.#emitEvent();

    const chunksData = await fetchChunks();

    const orchardEndChunk = chunksData.orchard.chunks;
    const saplingEndChunk = chunksData.sapling.chunks;

    const totalOrchardChunkToSync =
      orchardEndChunk - this.#syncStatus.lastChunk.orchard;
    const totalSaplingChunkToSync =
      saplingEndChunk - this.#syncStatus.lastChunk.sapling;
    const totalChunksToSync = totalOrchardChunkToSync + totalSaplingChunkToSync;
    const percentageMissing = 100 - this.#syncStatus.percentage;
    const percentagePerChunk = percentageMissing / totalChunksToSync;

    await this.#syncOnePool("orchard", orchardEndChunk, percentagePerChunk);
    await this.#syncOnePool("sapling", saplingEndChunk, percentagePerChunk);

    this.#syncStatus.percentage = 100;
    this.#emitEvent();

    const endTime = new Date();
    console.log("[sync] end:", endTime.toLocaleString());
    console.log(
      "[zcrawler] total time (seconds):",
      (endTime.getTime() - startTime.getTime()) / 1000,
    );

    // TODO
    // return the cancel item synchronously that allow the sync to be cancelled
    // or it can be an unsubscriber
    // return cancel;
  });

  #syncOnePool = async (
    pool: "sapling" | "orchard",
    endChunk: number,
    percentagePerChunk: number,
  ) => {
    const { promise, resolve, reject } = Promise.withResolvers<void>();

    const startChunk = this.#syncStatus.lastChunk[pool] + 1;
    const totalChunks = Math.max(0, endChunk - startChunk);

    const queue = serialQueue<ChunkWorkerSuccess>();
    let nextChunk = startChunk;
    let running = 0;
    let settled = false;

    const workers: Worker[] = [];
    const workersSize = Math.max(
      1,
      Math.min(navigator.hardwareConcurrency ?? 4, totalChunks),
    );

    const cleanup = () => {
      workers.forEach((w) => w.terminate());
    };
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
      // TODO callback, emit event or return promise?
      // options.onError?.(err);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
      // TODO callback, emit event or return promise?
      // options.onComplete?.();
    };
    // Stop the crawl without firing onComplete/onError — the caller asked for it.
    const cancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    // Hand a worker its next chunk, or retire it when the queue is drained.
    const feed = (w: Worker) => {
      if (nextChunk > endChunk) {
        running -= 1;
        if (running === 0) finish();
        return;
      }
      w.postMessage({
        ufvk: this.#ufvk,
        chunk: nextChunk,
        pool,
      } satisfies ChunkRequest);
      nextChunk++;
    };

    // TODO a stalled/errored worker chunks the apply frontier: `pending` grows
    // unbounded and the crawl never finishes. Needs per-chunk timeout/retry.
    for (let i = 0; i < workersSize; i++) {
      const w = new ZcrawlerWorker();
      workers.push(w);
      running += 1;
      w.onmessage = async (e: MessageEvent<ChunkWorkerResponse>) => {
        const msg = e.data;
        if ("error" in msg) {
          return fail(new Error(msg.error));
        }

        const msgIndex = msg.chunk - startChunk;
        queue.add(msgIndex, msg);

        const msgsToProcess = queue.consumeNextItems();
        msgsToProcess.forEach(({ hits, spends, chunk }) => {
          hits.forEach((hit, i) => {
            const note: Note = {
              ...hit,
              id: `${this.id}_${pool}_${chunk}_${i}`,
              spent: false,
            };
            this.#notes.push(note);
            this.#unspentNotesMap.set(note.nf_mine, note);
          });
          spends.forEach((spend) => {
            const note = this.#unspentNotesMap.get(spend);
            if (note) {
              note.spent = true;
              this.#unspentNotesMap.delete(spend);
            }
          });
        });

        const lastProcessedChunk = msgsToProcess.at(-1);
        if (lastProcessedChunk) {
          const syncedChunks =
            lastProcessedChunk.chunk - this.#syncStatus.lastChunk[pool];
          this.#syncStatus.lastChunk[pool] += syncedChunks;
          this.#syncStatus.percentage += syncedChunks * percentagePerChunk;
        }

        // TODO update only the delta of notes?
        this.#persister?.onSyncUpdate(this.#notes, this.#syncStatus);
        this.#emitEvent();

        if (settled) return;
        feed(w);
      };
      w.onerror = (e) => fail(new Error(e.message || "worker error"));
      feed(w);
    }

    // TODO how to return the cancel?
    console.log(cancel);

    return promise;
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
    console.info("getBalance");
    // TODO
    return [];
  }
}
