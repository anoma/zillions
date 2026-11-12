import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const packages = (name: string) => resolve(__dirname, `src/packages/${name}/src`);

// Node is enough: tests mock the browser modules they reach.
export default defineConfig({
  resolve: {
    // The vendored `@zillions/*` packages, as tsconfig.json's `paths` map them.
    alias: [
      { find: /^@zillions\/(storage|types|utils)$/, replacement: packages("$1") },
    ],
  },
  test: {
    environment: "node",
  },
});
