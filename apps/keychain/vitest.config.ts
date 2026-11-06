import { defineConfig } from "vitest/config";

// Node is enough: the invariant tests import only the zero-import
// modules (`passkey-constants.ts`, `passkey-seed.ts`), never browser
// modules.
export default defineConfig({
  test: {
    environment: "node",
  },
});
