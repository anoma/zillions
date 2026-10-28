import { fixupPluginRules } from "@eslint/compat";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([".output", ".wxt", "src/packages", "examples"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      { ...react.configs.flat.recommended, plugins: {} },
      tseslint.configs.recommended,
      prettier,
    ],
    // eslint-plugin-react and eslint-plugin-import still call context APIs removed in eslint 10
    plugins: {
      react: fixupPluginRules(react),
      import: fixupPluginRules(importPlugin),
      "react-hooks": reactHooks,
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        project: ["./tsconfig.json"],
      },
    },
    settings: {
      react: { version: "17.0" },
      "import/parsers": { "@typescript-eslint/parser": [".ts", ".tsx"] },
      "import/resolver": { typescript: { paths: ["./src"] } },
    },
    rules: {
      "no-use-before-define": "off",
      "no-shadow": "off",
      "@typescript-eslint/no-shadow": ["off"],
      "@typescript-eslint/no-require-imports": "off",
      "import/prefer-default-export": "off",
      "no-restricted-globals": [
        "error",
        {
          name: "browser",
          message: "You probably need to import webextension-polyfill.",
        },
      ],
      "react/react-in-jsx-scope": "off",
      "react/jsx-filename-extension": ["warn", { extensions: [".tsx"] }],
      "import/extensions": [
        "error",
        "ignorePackages",
        { ts: "never", tsx: "never" },
      ],
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          args: "all",
          ignoreRestSiblings: true,
        },
      ],
      "max-len": [
        "warn",
        {
          code: 120,
          ignoreTemplateLiterals: true,
          ignoreStrings: true,
          ignoreUrls: true,
          ignorePattern: "<path([/s/S]*?)/>",
        },
      ],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "off",
      "react/prop-types": "off",
      "@typescript-eslint/no-floating-promises": ["warn"],
    },
  },
]);
