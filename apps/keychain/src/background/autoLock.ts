/**
 * Auto-lock: the Keychain locks once the system has been idle for the chosen
 * number of minutes, or when the screen locks. Uses the `idle` API, so no
 * timer has to survive the MV3 worker being stopped.
 */
import browser from "webextension-polyfill";

import { stopCompute } from "./compute/host";
import { getServices } from "./services";

let minutes: number | undefined;

/**
 * What locking stops: the prover always, and reading chunks too unless the
 * user lets connected sites sync while locked.
 */
export const stopComputeOnLock = async (): Promise<void> => {
  const { localStorage } = await getServices();
  await stopCompute((await localStorage.getSyncWhileLocked()) ? "proving" : "all");
};

/** Sets the idle threshold; `0` leaves the Keychain unlocked until closed. */
export const applyAutoLock = (value: number): void => {
  minutes = value;
  if (value > 0) browser.idle.setDetectionInterval(value * 60);
};

/**
 * Must run synchronously at worker start-up, so the idle event that woke the
 * worker is delivered.
 */
export const startAutoLock = (): void => {
  const ready = getServices()
    .then(({ localStorage }) => localStorage.getAutoLockMinutes())
    .then(applyAutoLock);

  browser.idle.onStateChanged.addListener((state) => {
    if (state === "active") return;
    void ready
      .then(async () => {
        if (!minutes) return;
        const { vaultService, broadcaster } = await getServices();
        if (await vaultService.isLocked()) return;
        await vaultService.lock();
        void stopComputeOnLock();
        await broadcaster.locked();
      })
      .catch((e) => console.warn("Auto-lock failed", e));
  });
};
