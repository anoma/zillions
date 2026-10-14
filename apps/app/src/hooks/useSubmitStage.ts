import { useCallback, useRef, useState } from "react";
import type { ProveStage } from "../lib/wallet/chain/submit";

/** Where a submission is: building its PCZT, waiting on the keychain, then proving and broadcasting. */
export type SubmitStage = "building" | "approval" | ProveStage;

export type StageEntry = { stage: SubmitStage; at: number };

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/**
 * The stages a submission has reached, oldest first. `track(stage)` moves it
 * on, starting a new submission when none is running; `track(undefined,
 * error?)` ends it. Each step's time is logged to the console.
 */
export function useSubmitStage() {
  const [stages, setStages] = useState<StageEntry[]>([]);
  const run = useRef<{ start: number; last: StageEntry }>(undefined);

  const track = useCallback((stage?: SubmitStage, error?: unknown) => {
    const at = performance.now();
    const current = run.current;
    if (current) {
      console.log(
        `[submit] ${current.last.stage} took ${secs(at - current.last.at)}`,
      );
    }
    if (!stage) {
      if (current) {
        console.log(
          error
            ? `[submit] failed after ${secs(at - current.start)}: ${error instanceof Error ? error.message : String(error)}`
            : `[submit] done in ${secs(at - current.start)}`,
        );
      }
      run.current = undefined;
      return;
    }
    console.log(`[submit] ${stage}…`);
    const entry = { stage, at };
    run.current = { start: current?.start ?? at, last: entry };
    setStages((stages) => (current ? [...stages, entry] : [entry]));
  }, []);

  return { stages, track };
}
