import { INDEXER_URL } from "../config";
import type { Pool, TxLocator } from "../types";
import {
  firstChunkFrom as chunkFrom,
  fetchOk,
  postcard,
  treeSize,
} from "./chunks";
import { fetchWithRetry } from "./http";

export { CHUNK_SIZE, lastChunk } from "./chunks";

/** Each pool's note count at the indexer's tip. */
export type TreeSizes = Record<Pool, number>;

/**
 * One chunk of a pool's notes, raw; only wasm reads it. `ciphertexts` is the
 * compact part trial decryption rejects a note with; `memos` and `outgoing`
 * hold the rest, ~5× the bytes, so fetch them for hit chunks only.
 */
export async function fetchChunk(
  kind: "ciphertexts" | "memos" | "outgoing",
  chunk: number,
  pool: Pool,
) {
  const res = await fetchOk(`${INDEXER_URL}/${pool}/${kind}/${chunk}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function fetchTreeSizes(): Promise<TreeSizes> {
  const pools = ["ironwood", "orchard", "sapling"] as const;
  const sizes = await Promise.all(
    pools.map((pool) => treeSize(INDEXER_URL, pool)),
  );
  return Object.fromEntries(
    pools.map((pool, i) => [pool, sizes[i]]),
  ) as TreeSizes;
}

/** The first chunk holding a note at `height` or later; `last` if none does sooner. */
export const firstChunkFrom = (pool: Pool, height: number, last: number) =>
  chunkFrom(INDEXER_URL, pool, height, last);

/**
 * A pool's note commitment tree at ziziphus's tip, raw, and how many notes it
 * holds. The tip moves with every block, so a snapshot gone stale between the
 * redirect and the read is asked for again.
 */
export async function fetchTreeTip(pool: Pool) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetchWithRetry(`${INDEXER_URL}/${pool}/tip`);
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

/** Most nullifiers one `/spent` request may name. */
export const SPENT_BATCH = 1000;

/** `/spent`'s body: per nullifier asked, in order, its spending transaction or null. */
export function decodeSpent(body: Uint8Array): (TxLocator | null)[] {
  const read = postcard(body);
  read.varint(); // the indexer's committed tip
  return Array.from({ length: read.varint() }, () => {
    if (!read.byte()) return null;
    const [height, tx_index] = [read.varint(), read.varint()];
    read.varint(); // the spend's index in its transaction
    return { height, tx_index };
  });
}

/**
 * Where each of `nullifiers` (32 bytes each, at most `SPENT_BATCH`) was
 * revealed, in order; null when it isn't yet. Unlike every other call, it
 * tells the indexer which nullifiers are ours.
 */
export async function fetchSpent(
  pool: Pool,
  nullifiers: Uint8Array<ArrayBuffer>,
) {
  const res = await fetchOk(`${INDEXER_URL}/${pool}/spent`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: nullifiers,
  });
  return decodeSpent(new Uint8Array(await res.arrayBuffer()));
}
