import type { Pool, TxLocator } from "./types";

const LOCAL_INDEXER_URL = "http://localhost:8080";
const INDEXER_URL = import.meta.env.VITE_INDEXER_URL;

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

export type ChunksData = Record<
  Pool,
  { first_chunk: number; last_chunk: number }
>;

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
  const res = await fetchOk(`${INDEXER_URL}/${pool}/ciphertexts/${chunk}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** The same chunk with whole ciphertexts — ~50× the bytes. Hit chunks only. */
export async function fetchFullNotes(chunk: number, pool: Pool) {
  return get<FullNotesData>(
    `${LOCAL_INDEXER_URL}/notes/full?chunk=${chunk}&pool=${pool}`,
  );
}

/** A pool's note count, from where `/tip` redirects; throws if it names none. */
async function treeSize(pool: Pool) {
  // HEAD skips the snapshot body; a stale one 404s, but its URL has the size.
  const res = await fetch(`${INDEXER_URL}/${pool}/tip`, { method: "HEAD" });
  const size = Number(new URL(res.url).pathname.split("/").pop());
  if (!Number.isInteger(size)) throw new Error(`No tree size for ${pool}`);
  return size;
}

/** Each pool's chunk range from chunk 0; an empty pool ends at `last_chunk` -1. */
export async function fetchChunks(): Promise<ChunksData> {
  const pools = ["ironwood", "orchard", "sapling"] as const;
  const sizes = await Promise.all(pools.map(treeSize));
  return Object.fromEntries(
    pools.map((pool, i) => [
      pool,
      { first_chunk: 0, last_chunk: Math.ceil(sizes[i] / CHUNK_SIZE) - 1 },
    ]),
  ) as ChunksData;
}

/**
 * A pool's note commitment tree at ziziphus's tip, raw, and how many notes it
 * holds. The tip moves with every block, so a snapshot gone stale between the
 * redirect and the read is asked for again.
 */
export async function fetchTreeTip(pool: Pool) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${INDEXER_URL}/${pool}/tip`);
    if (res.ok) {
      const size = Number(new URL(res.url).pathname.split("/").pop());
      return { size, body: new Uint8Array(await res.arrayBuffer()) };
    }
    if (res.status !== 404 || attempt === 3) {
      throw new Error(`HTTP ${res.status} ${pool} tree tip`);
    }
  }
}

/** A frozen chunk of a pool's tree, raw. Immutable, so the HTTP cache keeps it. */
export async function fetchTreeChunk(pool: Pool, chunk: number) {
  const res = await fetchOk(`${INDEXER_URL}/${pool}/trees/${chunk}`);
  if (res.status === 202)
    throw new Error(`${pool} tree chunk ${chunk} isn't frozen yet`);
  return new Uint8Array(await res.arrayBuffer());
}

/** A revealed nullifier's leading bytes, with the transaction that revealed it. */
export type SpentNullifier = TxLocator & { nf_tag: string };

/** Every revealed nullifier sharing `nf`'s prefix — the bucket it hides in. */
export async function fetchNullifiers(nf: string, pool: Pool) {
  const prefix = nf.slice(0, PREFIX_LENGTH);
  return get<SpentNullifier[]>(
    `${LOCAL_INDEXER_URL}/nullifiers?pool=${pool}&prefix=${prefix}`,
  );
}
