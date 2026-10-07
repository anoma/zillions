import { INDEXER_URL } from "../config";
import type { Pool } from "../types";
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

/** A chunk's highest block height, read from the head of its body alone. */
async function maxHeight(pool: Pool, chunk: number) {
  const res = await fetchOk(`${INDEXER_URL}/${pool}/ciphertexts/${chunk}`, {
    headers: { Range: "bytes=0-15" },
  });
  // Postcard varints: min_height, median_height, max_height, then the count.
  const head = new Uint8Array(await res.arrayBuffer());
  let i = 0;
  const varint = () => {
    let n = 0;
    for (let shift = 0; ; shift += 7) {
      const byte = head[i++];
      n += (byte & 0x7f) * 2 ** shift;
      if (byte < 0x80) return n;
    }
  };
  varint();
  varint();
  return varint();
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

/**
 * One chunk of a pool's revealed nullifiers, raw, in chain order; only wasm
 * reads it. Every client fetches the same chunks, so the server never learns
 * which nullifiers are ours. Absent past the last chunk.
 */
export async function fetchNullifierChunk(pool: Pool, chunk: number) {
  const res = await fetchWithRetry(
    `${INDEXER_URL}/${pool}/nullifiers/${chunk}`,
  );
  if (res.status === 404) return undefined;
  if (!res.ok)
    throw new Error(`HTTP ${res.status} ${pool} nullifiers ${chunk}`);
  return new Uint8Array(await res.arrayBuffer());
}
