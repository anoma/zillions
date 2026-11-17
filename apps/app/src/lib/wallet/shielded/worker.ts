/**
 * Decrypt worker for a payment link's own key, which this page holds: fetches
 * one chunk from the indexer and trial-decrypts it. The account's chunks go to
 * the keychain instead, which keeps its key.
 */

import initZcore, { try_decrypt, try_decrypt_full } from "@zillions/zcore";
import { fetchChunk } from "../chain/indexer";
import { NETWORK } from "../config";
import type { ChunkWorkerResponse, LinkChunkRequest } from "../types";

let ready: Promise<unknown> | undefined;

// `self` typed as Window in a DOM-lib project; cast to the message surface we use.
const worker = self as unknown as {
  onmessage: ((e: MessageEvent<LinkChunkRequest>) => void) | null;
  postMessage: (msg: ChunkWorkerResponse) => void;
};

worker.onmessage = async (e) => {
  const { chunk, ufvk, pool, sends, tried } = e.data;
  try {
    await (ready ??= initZcore());
    const body = await fetchChunk("ciphertexts", chunk, pool);
    const resume = tried?.chunk === chunk ? tried : undefined;
    const compact = (
      sends
        ? { hits: [] }
        : try_decrypt(
            NETWORK,
            ufvk,
            pool,
            chunk,
            body,
            resume?.count ?? 0,
            Uint8Array.from(resume?.digest.match(/../g) ?? [], (b) =>
              parseInt(b, 16),
            ),
          )
    ) as {
      hits: { index: number }[];
      min_height?: number;
      count?: number;
      from?: number;
      digest?: string;
    };
    const { hits, min_height: minHeight, count, from, digest } = compact;
    const read = {
      minHeight,
      tried: digest ? { chunk, count: count!, digest } : undefined,
      skipped: from,
    };

    if (!hits.length && !sends) {
      worker.postMessage({ chunk, hits: [], sent: [], ...read });
      return;
    }

    // A hit makes the memos worth fetching; only a sends read opens outgoing ones.
    const [memos, outgoing] = await Promise.all([
      fetchChunk("memos", chunk, pool),
      sends ? fetchChunk("outgoing", chunk, pool) : new Uint8Array(),
    ]);
    const full = try_decrypt_full(
      NETWORK,
      ufvk,
      pool,
      chunk,
      body,
      memos,
      outgoing,
      Uint32Array.from(hits, (hit) => hit.index),
      Uint32Array.from(sends ?? []),
    );
    worker.postMessage({ chunk, ...full, ...read });
  } catch (err) {
    worker.postMessage({ chunk, error: String(err) });
  }
};
