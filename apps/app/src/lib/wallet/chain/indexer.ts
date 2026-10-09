import { INDEXER_URL } from "../config";
import type { Pool, TxLocator } from "../types";
import { fetchWithRetry } from "./http";

/** Notes per chunk. */
export const CHUNK_SIZE = 2 ** 14;

/** Each pool's note count at the indexer's tip. */
export type TreeSizes = Record<Pool, number>;

/** The chunk holding a tree's newest note, possibly still filling; -1 for an empty tree. */
export const lastChunk = (size: number) => Math.ceil(size / CHUNK_SIZE) - 1;

async function fetchOk(url: string, init?: RequestInit) {
  const res = await fetchWithRetry(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res;
}

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

/** A pool's note count, from where `/tip` redirects; throws if it names none. */
async function treeSize(pool: Pool) {
  // HEAD skips the snapshot body; a stale one 404s, but its URL has the size.
  const res = await fetchWithRetry(`${INDEXER_URL}/${pool}/tip`, {
    method: "HEAD",
  });
  const size = Number(new URL(res.url).pathname.split("/").pop());
  if (!Number.isInteger(size)) throw new Error(`No tree size for ${pool}`);
  return size;
}

export async function fetchTreeSizes(): Promise<TreeSizes> {
  const pools = ["ironwood", "orchard", "sapling"] as const;
  const sizes = await Promise.all(pools.map(treeSize));
  return Object.fromEntries(
    pools.map((pool, i) => [pool, sizes[i]]),
  ) as TreeSizes;
}

/** Reads `bytes` front to back, one postcard field per call. */
function postcard(bytes: Uint8Array) {
  let i = 0;
  return {
    byte: () => bytes[i++],
    varint: () => {
      let n = 0;
      for (let shift = 0; ; shift += 7) {
        const byte = bytes[i++];
        n += (byte & 0x7f) * 2 ** shift;
        if (byte < 0x80) return n;
      }
    },
  };
}

/** A chunk's highest block height, read from the head of its body alone. */
async function maxHeight(pool: Pool, chunk: number) {
  const res = await fetchOk(`${INDEXER_URL}/${pool}/ciphertexts/${chunk}`, {
    headers: { Range: "bytes=0-15" },
  });
  // Varints: min_height, median_height, max_height, then the count.
  const head = postcard(new Uint8Array(await res.arrayBuffer()));
  head.varint();
  head.varint();
  return head.varint();
}

/** The first chunk holding a note at `height` or later; `last` if none does sooner. */
export async function firstChunkFrom(pool: Pool, height: number, last: number) {
  let [low, high] = [0, Math.max(last, 0)];
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if ((await maxHeight(pool, mid)) >= height) high = mid;
    else low = mid + 1;
  }
  return low;
}

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
