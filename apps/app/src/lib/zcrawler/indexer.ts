/** HTTP client for the note indexer — the single source of its endpoint URLs. */

const CRAWLER_URL = import.meta.env.VITE_CRAWLER_URL ?? "http://localhost:8080";

/** Compact notes for a block range, as served by `/notes` (extra fields ignored). */
export interface RawNotes {
  sapling?: unknown[];
  orchard?: Array<{ nf: string }>;
}

/** Highest block the indexer has data for, to bound a scan. */
export async function getChainTip(): Promise<number> {
  const res = await fetch(`${CRAWLER_URL}/tip`);
  if (!res.ok) throw new Error(`tip: HTTP ${res.status}`);
  const { tip } = (await res.json()) as { tip: number };
  return tip;
}

/** Compact notes in `[from, to]` (both bounds inclusive). */
export async function fetchNotes(from: number, to: number): Promise<RawNotes> {
  const res = await fetch(`${CRAWLER_URL}/notes?start=${from}&end=${to}`);
  if (!res.ok) throw new Error(`notes ${from}-${to}: HTTP ${res.status}`);
  return res.json();
}
