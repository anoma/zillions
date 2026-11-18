import { startProveWorker } from "../src/background/compute/proveWorker";

// Started by the compute host (`src/background/compute/pool.ts`).
export default defineUnlistedScript(() => startProveWorker());
