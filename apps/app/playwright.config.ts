import { defineConfig, devices } from "@playwright/test";

const APP = "http://localhost:5290";
const CHAIN = "http://localhost:5291";

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: APP, trace: "retain-on-failure" },
  // Safari is unsupported.
  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
    { name: "firefox", use: devices["Desktop Firefox"] },
  ],
  webServer: [
    {
      command: "node e2e/chain.ts",
      url: `${CHAIN}/indexer/ironwood/tip/0`,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Test mode skips the build-time indexer lookup (vite.config.ts).
      command: "vite --mode test --port 5290 --strictPort",
      url: APP,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_INDEXER_URL: `${CHAIN}/indexer`,
        VITE_GRPC_URL: `${CHAIN}/lwd`,
        VITE_ZCASH_NETWORK: "main",
        VITE_DRY_RUN: "true",
      },
    },
  ],
});
