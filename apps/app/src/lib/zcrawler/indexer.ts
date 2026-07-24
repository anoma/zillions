/** HTTP client for the note indexer — the single source of its endpoint URLs. */

const CRAWLER_URL = import.meta.env.VITE_CRAWLER_URL ?? "http://localhost:8080";

/** A `/sync` range: compact notes for both pools + Sapling spend nullifiers (Orchard's ride inline as `rho`). */
export interface SyncData {
  orchard_notes: Array<{ rho: string }>;
  sapling_notes: unknown[];
  sapling_nullifiers: string[];
}

/** Highest block the indexer has data for, to bound a scan. */
export async function getChainTip(): Promise<number> {
  const res = await fetch(`${CRAWLER_URL}/tip`);
  if (!res.ok) throw new Error(`tip: HTTP ${res.status}`);
  const { tip } = (await res.json()) as { tip: number };
  return tip;
}

/** Notes + Sapling nullifiers in `[from, to]` (both bounds inclusive). */
export async function fetchSync(from: number, to: number): Promise<SyncData> {
  const res = await fetch(`${CRAWLER_URL}/sync?start=${from}&end=${to}`);
  if (!res.ok) throw new Error(`sync ${from}-${to}: HTTP ${res.status}`);
  return res.json();
}
