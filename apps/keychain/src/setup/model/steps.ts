/**
 * Step metadata (header title + progress), keyed by flow then step: the
 * passkey reuses the device branch's steps under different titles and
 * counts, so a step's metadata belongs to its flow. A flow's record lacks
 * the landing step — after backing out of a branch the step is `start`
 * while the flow lingers, and `StepHeader` falls back to `LANDING`.
 */
import type { Flow, Step } from "./wizard";

export type StepMeta = {
  /** Header title. */
  title: string;
  /** 1-based position within its branch (0 = no progress bar, e.g. start). */
  index: number;
  /** Total steps in the branch the step belongs to. */
  total: number;
};

export const LANDING: StepMeta = { title: "", index: 0, total: 0 };

export const STEP_META: Record<Flow, Partial<Record<Step, StepMeta>>> = {
  none: { start: LANDING },

  create: {
    "create.warning": { title: "New Seed Phrase", index: 1, total: 5 },
    "create.seed": { title: "New Seed Phrase", index: 2, total: 5 },
    "create.confirm": { title: "Verify your seed phrase", index: 3, total: 5 },
    "create.name": { title: "Create Your Account", index: 4, total: 5 },
    "create.complete": { title: "Keys Created", index: 5, total: 5 },
  },

  import: {
    "import.secret": { title: "Import Existing Keys", index: 1, total: 3 },
    "import.name": { title: "Set Up Your Imported Keys", index: 2, total: 3 },
    "import.complete": { title: "Keys Imported", index: 3, total: 3 },
  },

  device: {
    "device.choose": { title: "Hardware Wallet", index: 1, total: 4 },
    "device.connect": { title: "Connect Your Device", index: 2, total: 4 },
    "device.name": { title: "Set Up Your Device", index: 3, total: 4 },
    "device.complete": { title: "Device Connected", index: 4, total: 4 },
  },

  // The passkey skips the picker, so its count is one shorter.
  passkey: {
    "device.connect": { title: "Connect Your Passkey", index: 1, total: 3 },
    "device.name": { title: "Set Up Your Passkey", index: 2, total: 3 },
    "device.complete": { title: "Passkey Connected", index: 3, total: 3 },
  },
};
