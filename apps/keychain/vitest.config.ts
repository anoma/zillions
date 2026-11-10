import { defineConfig } from "vitest/config";

// Node is enough: tests mock the browser modules they reach.
export default defineConfig({
  test: {
    environment: "node",
  },
});
