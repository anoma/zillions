import { defineConfig } from "vitest/config";

// Node is enough: the invariant tests import only the zero-import
// consensus constants (`passkey-constants.ts`), never browser modules.
export default defineConfig({
  test: {
    environment: "node",
  },
});
