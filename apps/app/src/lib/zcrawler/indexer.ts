import type { Pool, TxLocator } from "./types";

const CRAWLER_URL = import.meta.env.VITE_CRAWLER_URL ?? "http://localhost:8080";
const WEBSERVER_URL =
  import.meta.env.VITE_WEBSERVER_URL ?? "http://localhost:1234/api/v1";

/** One pool's notes for a full chunk. Only wasm reads their shape; TS forwards them. */
export type FullNotesData = unknown[];

/**
 * Hex chars of a nullifier sent to the indexer, which answers with every
 * nullifier sharing that prefix so it never learns which one we asked about.
 * The server rejects any other length, so this has to track its bucket size.
 */
const PREFIX_LENGTH = 6;

/** Notes per chunk on the new server, and on the old one. */
export const CHUNK_SIZE = 2 ** 14;
export const OLD_CHUNK_SIZE = 4096;

export interface ChunksData {
  orchard: {
    first_chunk: number;
    last_chunk: number;
  };
  sapling: {
    first_chunk: number;
    last_chunk: number;
  };
}

async function fetchOk(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res;
}

async function get<T>(url: string): Promise<T> {
  return (await fetchOk(url)).json();
}

/**
 * A chunk's notes, compact: only what trial decryption needs to reject one.
 * Still binary; only wasm reads it.
 */
export async function fetchCiphertexts(chunk: number, pool: Pool) {
  const res = await fetchOk(`${WEBSERVER_URL}/${pool}/ciphertexts/${chunk}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** The same chunk with whole ciphertexts — ~50× the bytes. Hit chunks only. */
export async function fetchFullNotes(chunk: number, pool: Pool) {
  return get<FullNotesData>(
    `${CRAWLER_URL}/notes/full?chunk=${chunk}&pool=${pool}`,
  );
}

/**
 * ponytail: each pool's range on the new server, hardcoded until it serves its
 * tree size. The first chunk is the lowest the dev index holds in full, the
 * last was the tip chunk when this was set.
 */
export const CHUNKS: ChunksData = {
  orchard: { first_chunk: 3061, last_chunk: 3080 },
  sapling: { first_chunk: 4513, last_chunk: 4514 },
};

/** A revealed nullifier's leading bytes, with the transaction that revealed it. */
export type SpentNullifier = TxLocator & { nf_tag: string };

/** Every revealed nullifier sharing `nf`'s prefix — the bucket it hides in. */
export async function fetchNullifiers(nf: string, pool: Pool) {
  const prefix = nf.slice(0, PREFIX_LENGTH);
  return get<SpentNullifier[]>(
    `${CRAWLER_URL}/nullifiers?pool=${pool}&prefix=${prefix}`,
  );
}
