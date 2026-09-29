import type { Pool, TxLocator } from "./types";

const CRAWLER_URL = import.meta.env.VITE_CRAWLER_URL ?? "http://localhost:8080";

/** One pool's notes for a compact chunk. Only wasm reads their shape; TS forwards them. */
export type CompactNotesData = unknown[];

/** One pool's notes for a full chunk. Only wasm reads their shape; TS forwards them. */
export type FullNotesData = unknown[];

/**
 * Hex chars of a nullifier sent to the indexer, which answers with every
 * nullifier sharing that prefix so it never learns which one we asked about.
 * The server rejects any other length, so this has to track its bucket size.
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

/** A chunk's notes, compact: only what trial decryption needs to reject one. */
export async function fetchCompactNotes(chunk: number, pool: Pool) {
  return get<CompactNotesData>(
    `${CRAWLER_URL}/notes/compact?chunk=${chunk}&pool=${pool}`,
  );
}

/** The same chunk with whole ciphertexts — ~50× the bytes. Hit chunks only. */
export async function fetchFullNotes(chunk: number, pool: Pool) {
  return get<FullNotesData>(
    `${CRAWLER_URL}/notes/full?chunk=${chunk}&pool=${pool}`,
  );
}

/** `birthday` (a block height) raises each pool's `first_chunk` to that floor. */
export async function fetchChunks(birthday?: number) {
  const query = birthday === undefined ? "" : `?birthday=${birthday}`;
  return get<ChunksData>(`${CRAWLER_URL}/chunks${query}`);
}

/** A revealed nullifier's leading bytes, with the transaction that revealed it. */
export type SpentNullifier = TxLocator & { nf_tag: string };

/** Every revealed nullifier sharing `nf`'s prefix — the bucket it hides in. */
export async function fetchNullifiers(nf: string, pool: Pool) {
  const prefix = nf.slice(0, PREFIX_LENGTH);
  return get<SpentNullifier[]>(
    `${CRAWLER_URL}/nullifiers?pool=${pool}&prefix=${prefix}`,
  );
}
