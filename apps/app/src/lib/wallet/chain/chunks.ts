/**
 * Where chunks sit on the indexer. Free of the app's env, so the build can
 * run it too (vite.config.ts).
 */

import { fetchWithRetry } from "./http";

/** Notes per chunk. */
export const CHUNK_SIZE = 2 ** 14;

/** The chunk holding a tree's newest note, possibly still filling; -1 for an empty tree. */
export const lastChunk = (size: number) => Math.ceil(size / CHUNK_SIZE) - 1;

export async function fetchOk(url: string, init?: RequestInit) {
  const res = await fetchWithRetry(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res;
}

/** Reads `bytes` front to back, one postcard field per call. */
export function postcard(bytes: Uint8Array) {
  let i = 0;
  return {
    byte: () => bytes[i++],
    varint: () => {
      let n = 0;
      for (let shift = 0; ; shift += 7) {
        // Past the end `bytes[i]` is undefined, which no comparison ends.
        if (i >= bytes.length) throw new Error("Truncated postcard varint");
        const byte = bytes[i++];
        n += (byte & 0x7f) * 2 ** shift;
        if (byte < 0x80) return n;
      }
    },
  };
}

/** A pool's note count, from where `/tip` redirects; throws if it names none. */
export async function treeSize(indexer: string, pool: string) {
  // HEAD skips the snapshot body; a stale one 404s, but its URL has the size.
  const res = await fetchWithRetry(`${indexer}/${pool}/tip`, {
    method: "HEAD",
  });
  const size = Number(new URL(res.url).pathname.split("/").pop());
  if (!Number.isInteger(size)) throw new Error(`No tree size for ${pool}`);
  return size;
}

/** A chunk's highest block height, read from the head of its body alone. */
export async function maxHeight(indexer: string, pool: string, chunk: number) {
  const res = await fetchOk(`${indexer}/${pool}/ciphertexts/${chunk}`, {
    headers: { Range: "bytes=0-15" },
  });
  // Varints: min_height, median_height, max_height, then the count.
  const head = postcard(new Uint8Array(await res.arrayBuffer()));
  head.varint();
  head.varint();
  return head.varint();
}

/** The first chunk holding a note at `height` or later; `last` if none does sooner. */
export async function firstChunkFrom(
  indexer: string,
  pool: string,
  height: number,
  last: number,
) {
  let [low, high] = [0, Math.max(last, 0)];
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if ((await maxHeight(indexer, pool, mid)) >= height) high = mid;
    else low = mid + 1;
  }
  return low;
}
