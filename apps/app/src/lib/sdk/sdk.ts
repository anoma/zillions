import initWasm, { initThreadPool } from "@zillions-sdk/wallet";
import { loadProverParams } from "@zillions-sdk/wallet/params";
import { singleton } from "../utils";

export const initSdk = singleton(async () => {
  await initWasm();
  await initThreadPool(window.navigator.hardwareConcurrency);
  // Start downloading the Sapling proving params (~50MB, IndexedDB-cached) in
  // the background; proving awaits the same promise via awaitProverParams.
  loadProverParams().catch((e) =>
    console.error("Background Sapling params load failed", e),
  );
});

/** Resolves when the Sapling proving params are installed; retries a failed download. */
export const awaitProverParams = () => loadProverParams();
