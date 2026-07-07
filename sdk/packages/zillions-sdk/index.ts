/**
 * Wallet runtime lifecycle: wasm init, worker thread pool, and a background
 * download of the Sapling proving params. Call initSdk() once at app start;
 * await awaitProverParams() before proving/sending.
 */

import initWasm, { initThreadPool } from "./wasm/wallet/zillions_sdk_wallet.js";
import { loadProverParams } from "./params";

// The wallet API is the SDK's main surface — re-export it from the root.
// Keys and requests stay behind subpaths: their symbol names collide with
// the wallet's (e.g. both export a Pczt).
export * from "./wasm/wallet/zillions_sdk_wallet.js";
export { syncWallet } from "./sync";
export type { SyncOptions, SyncProgress } from "./sync";

export interface InitSdkOptions {
  /** Threads for the wasm worker pool. Defaults to navigator.hardwareConcurrency. */
  threads?: number;
  /** Base URL to fetch the Sapling .params files from. Defaults to the files served out of @zillions-sdk/sapling-params. */
  saplingParamsUrl?: string;
  /** Start the ~50MB Sapling params download in the background. Defaults to true; consumers that never prove (e.g. the keychain) should pass false. */
  preloadSaplingParams?: boolean;
}

let sdkReady: Promise<void> | undefined;

/**
 * Initializes the wallet wasm, worker thread pool, and starts the Sapling
 * params download in the background. Idempotent: repeat calls share one
 * in-flight promise.
 */
export function initSdk(options: InitSdkOptions = {}): Promise<void> {
  return (sdkReady ??= (async () => {
    await initWasm();
    await initThreadPool(options.threads ?? navigator.hardwareConcurrency);
    if (options.preloadSaplingParams ?? true) {
      // Fire-and-forget: proving awaits the same promise via awaitProverParams.
      loadProverParams(options.saplingParamsUrl).catch((e) =>
        console.error("Background Sapling params load failed", e),
      );
    }
  })());
}

/** Resolves when the Sapling proving params are installed; retries a failed download. */
export const awaitProverParams = (baseUrl?: string): Promise<void> =>
  loadProverParams(baseUrl);
