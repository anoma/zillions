/**
 * Wallet synchronization engine.
 *
 * Drives the wasm sync stages from JS so progress can be observed and the
 * wallet state checkpointed between batches (surviving page refreshes):
 *
 *   1. sync_update_subtree_roots — once per call
 *   2. sync_update_chain_tip + sync_refresh_utxos — once per pass
 *   3. scan the suggested ranges batch by batch, re-requesting the ranges
 *      after every scan (scanning can reprioritize them or rewind after a
 *      chain reorg), emitting progress and checkpoints along the way
 *   4. sync_enhance_transactions — fetch full data for transactions the
 *      scanner discovered (sent outputs, memos, fees) and the history of
 *      the wallet's transparent addresses
 *   5. when the ranges drain, refresh the tip again; done when no new
 *      ranges appear
 *
 * The wallet database tracks its own scan queue, so persisting the
 * checkpoint bytes IS the sync progress: restore them into the WebWallet
 * constructor and syncing resumes where it left off.
 */

import type { WebWallet } from './wallet';

export interface SyncProgress {
  /** Current chain tip height as of the last tip refresh. */
  chainTip: number;
  /** Height below which everything is scanned. */
  fullyScannedHeight: number;
  /** Blocks remaining in the wallet's suggested scan ranges. */
  remainingBlocks: number;
  /** Overall scan progress in percent (0–100). */
  percent: number;
}

export interface SyncOptions {
  /** Maximum blocks downloaded + scanned per batch. Defaults to 1000. */
  batchSize?: number;
  /** Called after each scanned batch. */
  onProgress?: (progress: SyncProgress) => void;
  /**
   * Called with the serialized wallet database after scanned batches; persist
   * these bytes and pass them to the WebWallet constructor to resume syncing
   * after a page refresh.
   */
  onCheckpoint?: (dbBytes: Uint8Array) => void | Promise<void>;
  /** Checkpoint frequency in batches. Defaults to 1 (every batch). */
  checkpointEveryBatches?: number;
  /** Aborts between batches (a batch in flight runs to completion). */
  signal?: AbortSignal;
}

const sumBlocks = (ranges: [number, number][]): number =>
  ranges.reduce((n, [start, end]) => n + (end - start), 0);

/**
 * Sync the wallet to the chain tip. Resolves when the wallet is fully
 * synced; rejects on network/scan failure (safe to call again to resume —
 * all completed work is already in the wallet database).
 */
export async function syncWallet(
  wallet: WebWallet,
  options: SyncOptions = {},
): Promise<void> {
  const batchSize = options.batchSize ?? 1000;
  const checkpointEvery = options.checkpointEveryBatches ?? 1;

  const suggestRanges = async (): Promise<[number, number][]> =>
    (await wallet.suggest_scan_ranges()) as [number, number][];

  await wallet.sync_update_subtree_roots();

  let batches = 0;
  let scannedBlocks = 0;
  let totalBlocks = 0;

  const emitProgress = async (chainTip: number, remainingBlocks: number) => {
    if (!options.onProgress) return;
    const summary = await wallet.get_wallet_summary();
    try {
      options.onProgress({
        chainTip,
        fullyScannedHeight: summary?.fully_scanned_height ?? 0,
        remainingBlocks,
        percent:
          totalBlocks > 0
            ? Math.min(100, (scannedBlocks / totalBlocks) * 100)
            : 100,
      });
    } finally {
      summary?.free();
    }
  };

  let enhanced = false;

  for (;;) {
    options.signal?.throwIfAborted();

    const chainTip = await wallet.sync_update_chain_tip();
    await wallet.sync_refresh_utxos();

    let ranges = await suggestRanges();
    if (ranges.length === 0) break;
    totalBlocks = Math.max(totalBlocks, scannedBlocks + sumBlocks(ranges));

    while (ranges.length > 0) {
      options.signal?.throwIfAborted();

      const [start, end] = ranges[0];
      const batchEnd = Math.min(end, start + batchSize);
      await wallet.sync_scan_range(start, batchEnd);
      batches += 1;
      scannedBlocks += batchEnd - start;

      // Ranges must be re-requested after every scan; a reorg rewind or a
      // new higher-priority range grows the remaining total.
      ranges = await suggestRanges();
      const remainingBlocks = sumBlocks(ranges);
      totalBlocks = Math.max(totalBlocks, scannedBlocks + remainingBlocks);

      if (options.onCheckpoint && batches % checkpointEvery === 0) {
        await options.onCheckpoint(await wallet.db_to_bytes());
      }
      await emitProgress(chainTip, remainingBlocks);
    }

    // Ranges drained; complete the freshly scanned transactions before
    // refreshing the tip in case new blocks arrived.
    await wallet.sync_enhance_transactions();
    enhanced = true;
  }

  // A wallet restored already-synced never enters the scan loop but may
  // still have unserviced data requests from a previous session.
  if (!enhanced) {
    await wallet.sync_enhance_transactions();
  }

  // Final checkpoint so the fully synced and enhanced wallet is what gets
  // restored next session.
  if (options.onCheckpoint) {
    await options.onCheckpoint(await wallet.db_to_bytes());
  }
}
