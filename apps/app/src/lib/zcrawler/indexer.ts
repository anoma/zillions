import type { Pool } from "./types";

const CRAWLER_URL = import.meta.env.VITE_CRAWLER_URL ?? "http://localhost:8080";

export interface SyncData {
  orchard_notes?: Array<{ rho: string }>;
  sapling_notes?: unknown[];
  sapling_nullifiers?: string[];
}

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
