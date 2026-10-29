/**
 * Step metadata (header title + progress), keyed by `Step`. The header reads
 * the entry for the active step.
 */
import type { Step } from "./wizard";

export type StepMeta = {
  /** Header title. */
  title: string;
  /** 1-based position within its branch (0 = no progress bar, e.g. start). */
  index: number;
  /** Total steps in the branch the step belongs to. */
  total: number;
};

export const STEP_META: Record<Step, StepMeta> = {
  start: { title: "", index: 0, total: 0 },

  "create.warning": { title: "New Seed Phrase", index: 1, total: 5 },
  "create.seed": { title: "New Seed Phrase", index: 2, total: 5 },
  "create.confirm": { title: "Verify your seed phrase", index: 3, total: 5 },
  "create.name": { title: "Create Your Account", index: 4, total: 5 },
  "create.complete": { title: "Keys Created", index: 5, total: 5 },

  "import.secret": { title: "Import Existing Keys", index: 1, total: 3 },
  "import.name": { title: "Set Up Your Imported Keys", index: 2, total: 3 },
  "import.complete": { title: "Keys Imported", index: 3, total: 3 },

  "device.connect": { title: "Connect Your Device", index: 1, total: 3 },
  "device.name": { title: "Set Up Your Device", index: 2, total: 3 },
  "device.complete": { title: "Device Connected", index: 3, total: 3 },
};
