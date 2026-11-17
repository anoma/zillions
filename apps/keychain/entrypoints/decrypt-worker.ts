import { startDecryptWorker } from "../src/background/compute/decryptWorker";

// Started by the compute host (`src/background/compute/pool.ts`), one per core.
export default defineUnlistedScript(() => startDecryptWorker());
