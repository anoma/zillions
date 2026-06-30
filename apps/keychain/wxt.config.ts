import tailwindcss from "@tailwindcss/vite";
import { config as loadDotenv } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import svgr from "vite-plugin-svgr";
import { defineConfig } from "wxt";

const r = (p: string): string => resolve(__dirname, p);

const pkg = JSON.parse(readFileSync(r("package.json"), "utf-8")) as {
  version: string;
};

/**
 * Replicates the legacy extension's `define`: every `Z_INTERFACE_*` from `.env`
 * (process.env wins), plus TARGET/NODE_ENV/version, so `@zillions/*` packages
 * that read `process.env.Z_INTERFACE_*` keep resolving.
 */
const buildProcessEnv = (
  target: string
): Record<string, string | undefined> => {
  const fileEnv: Record<string, string | undefined> = {};
  loadDotenv({ path: r(".env"), processEnv: fileEnv });

  const env: Record<string, string | undefined> = {
    ...fileEnv,
    ...process.env,
    TARGET: target,
    NODE_ENV: process.env.NODE_ENV || "production",
    npm_package_version: pkg.version,
  };

  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith("Z_INTERFACE_")) result[key] = value;
  }
  for (const key of ["TARGET", "NODE_ENV", "npm_package_version"]) {
    result[key] = env[key];
  }
  return result;
};

// `@zillions/*` -> the vendored package sources under `src/packages/*`
// (bare package + `/src/...` subpaths).
//
// `crypto` is special-cased: its entry is a prebuilt
// wasm-bindgen `.js` glue file (not an `src/index`), so the bare import must
// point at that file — otherwise the generic rule resolves it to a DIRECTORY
// and the bundler fails with "Is a directory". The `/src/...` subpath rule
// still handles `@zillions/crypto/src/crypto/crypto_bg.wasm?url`.
const zillionsAliases = (): { find: RegExp; replacement: string }[] => {
  const generic = ["components", "storage", "types", "utils"].flatMap(
    (name) => [
      {
        find: new RegExp(`^@zillions/${name}/src/(.*)$`),
        replacement: r(`src/packages/${name}/src/$1`),
      },
      {
        find: new RegExp(`^@zillions/${name}(?:/(.*))?$`),
        replacement: r(`src/packages/${name}/src/$1`),
      },
    ]
  );

  const crypto = [
    {
      find: /^@zillions\/crypto\/src\/(.*)$/,
      replacement: r(`src/packages/crypto/src/$1`),
    },
    {
      find: /^@zillions\/crypto$/,
      replacement: r(`src/packages/crypto/src/crypto/crypto.js`),
    },
  ];

  return [...crypto, ...generic];
};

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: ".",
  
  runner: {
    // This forces the dev browser to reuse the same profile directory
    // keeping cookies, localStorage, and IndexedDB safe between sessions.
    chromiumArgs: ['--user-data-dir=./.wxt/dev-profile'],
  },

  manifest: ({ browser }) => ({
    name: "Zillions Keychain (z)",
    description:
      "The Zillions Keychain manages a user's wallet for the Zcash ecosystem.",
    version: pkg.version,
    // `tabs` lets the background find/focus an already-open Setup tab by URL
    // (browser.tabs.query({ url })) instead of opening duplicates.
    permissions: ["storage", "tabs"],
    // Toolbar action opens the popup (`entrypoints/popup`). WXT fills in
    // `default_popup` from that entrypoint; we only set the title here. The
    // popup itself redirects to the Setup tab when no wallet exists yet.
    action: {
      default_title: "Zillions Keychain",
    },
    // WebAssembly (@zillions/crypto, @zillions-sdk/keys) compiles in the
    // service worker and extension pages, which the default MV3 CSP
    // (`script-src 'self'`) forbids. `'wasm-unsafe-eval'` is the only addition
    // Chrome MV3 allows for this and is what enables WASM instantiation.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    // `injected.js` is the MAIN-world provider script the content script
    // injects into pages (sets `window.zc`). WASM: `crypto_bg.wasm`
    // (@zillions/crypto) is small and inlined; `zillions_sdk_keys_bg.wasm`
    // (@zillions-sdk/keys, ~2 MB) is emitted as a file the page fetches —
    // list both so resolution is explicit.
    web_accessible_resources: [
      {
        resources: ["injected.js", "crypto_bg.wasm", "zillions_sdk_keys_bg.wasm"],
        matches: ["<all_urls>"],
      },
    ],
    icons: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png",
    },
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              strict_min_version: "115.0",
              data_collection_permissions: { required: ["none"] },
            },
          },
        }
      : {}),
  }),

  vite: ({ browser }) => ({
    define: {
      "process.env": JSON.stringify(buildProcessEnv(browser)),
    },
    plugins: [
      tailwindcss(),
      svgr({
        svgrOptions: { prettier: false, svgo: false, titleProp: true, ref: true },
        include: "**/*.svg",
      }),
      nodePolyfills({
        globals: { Buffer: true, global: true, process: false },
        protocolImports: true,
        exclude: ["vm"],
      }),
      {
        name: "zillions-alias",
        config() {
          return { resolve: { alias: zillionsAliases() } };
        },
      },
    ],
  }),
});
