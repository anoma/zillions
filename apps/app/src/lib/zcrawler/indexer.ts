import type { Pool } from "./types";

const CRAWLER_URL = import.meta.env.VITE_CRAWLER_URL ?? "http://localhost:8080";

/** One pool's notes for a chunk. Only wasm reads their shape; TS forwards them. */
export type SyncData = unknown[];

/**
 * Hex chars of a nullifier sent to the indexer, which answers with every
 * nullifier sharing that prefix so it never learns which one we asked about.
 * The server rejects any other length, so this tracks its 3-byte bucket.
 */
const PREFIX_LENGTH = 6;

export interface ChunksData {
  chunk_size: number;
  orchard: {
    first_chunk: number;
    last_chunk: number;
  };
  sapling: {
    first_chunk: number;
    last_chunk: number;
  };
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

export async function fetchSync(chunk: number, pool: Pool) {
  return get<SyncData>(`${CRAWLER_URL}/sync?chunk=${chunk}&pool=${pool}`);
}

export async function fetchChunks() {
  return get<ChunksData>(`${CRAWLER_URL}/chunks`);
}

/** True if `nf` has been revealed on chain, i.e. the note it belongs to is spent. */
export async function isSpent(nf: string, pool: Pool) {
  const prefix = nf.slice(0, PREFIX_LENGTH);
  const nullifiers = await get<string[]>(
    `${CRAWLER_URL}/nullifiers?pool=${pool}&prefix=${prefix}`,
  );
  // Indexer hex case must not decide equality; `nf_mine` is lowercase.
  return nullifiers.some((candidate) => candidate.toLowerCase() === nf);
}
