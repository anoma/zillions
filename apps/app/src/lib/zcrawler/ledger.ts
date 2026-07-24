import type { ChunkData, CrawlHit, CrawlResult } from "./types";

/**
 * Folds decrypted chunks into the wallet's notes, tracking which are spent.
 *
 * Chunks may arrive out of order but are folded in block order — a note is
 * always created before it is spent — so the held set keeps only owned unspent
 * notes: a spend nullifier that matches none of ours is dropped on sight rather
 * than accumulated. Pure and worker-free, so it can be exercised in isolation.
 */
export class SpendLedger {
  /** Owned notes in block order, mutated in place as spends resolve. */
  readonly hits: CrawlHit[] = [];
  /** Owned unspent Orchard notes, keyed by their own nullifier. */
  #unspent = new Map<string, CrawlHit>();
  /** Out-of-order chunks waiting for their turn at the fold frontier. */
  #pending = new Map<number, ChunkData>();
  #nextApply = 0;
  #peakUnspent = 0;

  /** Buffer a chunk by index, then fold everything now contiguous from the frontier. */
  accept(id: number, chunk: ChunkData): void {
    this.#pending.set(id, chunk);
    while (this.#pending.has(this.#nextApply)) {
      this.#fold(this.#pending.get(this.#nextApply)!);
      this.#pending.delete(this.#nextApply);
      this.#nextApply += 1;
    }
  }

  /** Live memory: held-set size (grows/shrinks), reorder-buffer depth, and peak. */
  get stats(): { unspent: number; buffered: number; peak: number } {
    return {
      unspent: this.#unspent.size,
      buffered: this.#pending.size,
      peak: this.#peakUnspent,
    };
  }

  result(): CrawlResult {
    return {
      hits: this.hits,
      totalValue: this.hits.reduce((n, h) => n + h.value, 0),
      netValue: this.hits.reduce((n, h) => n + (h.spent ? 0 : h.value), 0),
      nullifierSetSize: this.#peakUnspent,
      nullifierSetBytes: this.#peakUnspent * 32,
    };
  }

  /** Register a chunk's notes, then resolve its spends against the live set. */
  #fold(chunk: ChunkData): void {
    for (const h of chunk.hits) {
      this.hits.push(h);
      if (h.pool === "orchard") this.#unspent.set(h.nf_mine, h);
    }
    for (const nf of chunk.spends) {
      const note = this.#unspent.get(nf);
      if (note) {
        note.spent = true;
        this.#unspent.delete(nf);
      }
    }
    this.#peakUnspent = Math.max(this.#peakUnspent, this.#unspent.size);
  }
}
