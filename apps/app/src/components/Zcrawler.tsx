import { useEffect, useRef, useState } from "react";

import { useAccount } from "../hooks/useAccount";
import { crawlNotes, getChainTip, type CrawlHit } from "../lib/zcrawler";

export function Zcrawler() {
  const account = useAccount();
  const [ufvk, setUfvk] = useState(account.shielded.viewingKey ?? "");
  const [start, setStart] = useState(account.shielded.birthday);
  const [end, setEnd] = useState(account.shielded.birthday);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hits, setHits] = useState<CrawlHit[]>([]);
  const [nfSet, setNfSet] = useState<{ size: number; bytes: number }>();
  const [error, setError] = useState<string>();
  const abort = useRef<AbortController | undefined>(undefined);

  const totalValue = hits.reduce((n, h) => n + h.value, 0);
  const netValue = hits.reduce((n, h) => n + (h.spent ? 0 : h.value), 0);
  const spentCount = hits.filter((h) => h.spent).length;

  console.log(hits);

  // Default the end to the indexer's chain tip.
  useEffect(() => {
    getChainTip()
      .then(setEnd)
      .catch((e) => setError(String(e)));
  }, []);

  const scan = async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setScanning(true);
    setError(undefined);
    setHits([]);
    setProgress(0);

    const startTime = new Date();
    console.log("[zcrawler] start:", startTime.toLocaleString());
    try {
      const result = await crawlNotes(ufvk.trim(), start, end, {
        signal: controller.signal,
        onProgress: (hits, scanned, total) => {
          setHits(hits);
          setProgress(total > 0 ? scanned / total : 1);
        },
      });
      setHits(result.hits);
      setNfSet({
        size: result.nullifierSetSize,
        bytes: result.nullifierSetBytes,
      });
      const endTime = new Date();
      console.log("[zcrawler] end:", endTime.toLocaleString());
      console.log(
        "[zcrawler] total time (seconds):",
        (endTime.getTime() - startTime.getTime()) / 1000,
      );
    } catch (e) {
      console.error(e);
      if (!controller.signal.aborted) setError(String(e));
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="p-10 flex flex-col gap-6 font-medium border-b border-gray-300 overflow-auto">
      <div className="flex items-center justify-between gap-4">
        <div className="text-lg">Zcrawler</div>
        <div className="text-right">
          <div className="text-sm text-gray-500">Total notes</div>
          <div className="text-2xl tabular-nums">{hits.length}</div>
          <div className="text-sm text-gray-500">
            {(netValue / 1e8).toFixed(8)} ZEC spendable
          </div>
          <div className="text-xs text-gray-400 tabular-nums">
            {(totalValue / 1e8).toFixed(8)} gross
          </div>
          <div className="text-xs text-gray-400 tabular-nums">
            {hits.filter((h) => h.scope === "external").length} received ·{" "}
            {hits.filter((h) => h.scope === "internal").length} change ·{" "}
            {spentCount} spent
          </div>
          {nfSet && (
            <div className="text-xs text-gray-400 tabular-nums">
              nullifier set: {nfSet.size} nf · {(nfSet.bytes / 1024).toFixed(1)}{" "}
              KB
            </div>
          )}
        </div>
      </div>

      <textarea
        className="w-full rounded border border-gray-300 p-2 font-mono text-xs"
        rows={3}
        placeholder="Unified Full Viewing Key (uview…)"
        value={ufvk}
        onChange={(e) => setUfvk(e.target.value)}
      />

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col text-sm">
          Start
          <input
            className="rounded border border-gray-300 p-2 tabular-nums"
            type="number"
            value={start}
            onChange={(e) => setStart(Number(e.target.value))}
          />
        </label>
        <label className="flex flex-col text-sm">
          End
          <input
            className="rounded border border-gray-300 p-2 tabular-nums"
            type="number"
            value={end}
            onChange={(e) => setEnd(Number(e.target.value))}
          />
        </label>
        <button
          className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
          disabled={scanning || !ufvk.trim() || end < start}
          onClick={scan}
        >
          {scanning ? `Scanning ${Math.round(progress * 100)}%…` : "Scan"}
        </button>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}
    </div>
  );
}
