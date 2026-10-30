import js from "@eslint/js";
import pluginQuery from "@tanstack/eslint-plugin-query";
import reactHooks from "eslint-plugin-react-hooks";
import { reactRefresh } from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist", "test-results", "playwright-report"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      // TanStack Router's Vite plugin hot-reloads the Route export.
      reactRefresh.configs.vite({
        extraHOCs: ["createFileRoute", "createRootRoute"],
      }),
      pluginQuery.configs["flat/recommended-strict"],
    ],
    rules: {
      "@tanstack/query/exhaustive-deps": [
        "error",
        {
          allowlist: {
            variables: ["wallet"],
            types: ["SdkWallet"],
          },
        },
      ],
    },
    languageOptions: {
      globals: globals.browser,
    },
  },
]);
