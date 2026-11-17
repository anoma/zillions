import tailwindcss from "@tailwindcss/vite";
import { config as loadDotenv } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import svgr from "vite-plugin-svgr";
import { defineConfig } from "wxt";

import { RP_ID, rpHostPermissions } from "./src/hardware/passkey-constants";

const r = (p: string): string => resolve(__dirname, p);

const pkg = JSON.parse(readFileSync(r("package.json"), "utf-8")) as {
  version: string;
};

/**
 * Replicates the legacy extension's `define`: every `Z_INTERFACE_*` from `.env`
 * (process.env wins), plus TARGET/NODE_ENV/version, so `@zillions/*` packages
 * that read `process.env.Z_INTERFACE_*` keep resolving.
 *
 * NODE_ENV comes from WXT's mode, not the shell: an exported
 * `NODE_ENV=development` must not relax the password rules in a release build.
 */
const buildProcessEnv = (
  target: string,
  mode: string,
): Record<string, string | undefined> => {
  const fileEnv: Record<string, string | undefined> = {};
  loadDotenv({ path: r(".env"), processEnv: fileEnv });

  const env: Record<string, string | undefined> = {
    ...fileEnv,
    ...process.env,
    TARGET: target,
    NODE_ENV: mode,
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
// and the bundler fails with "Is a directory".
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
    ],
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

  // nodePolyfills injects shim imports into every module that touches
  // `global`/`Buffer`, including workspace-linked ones like @zillions/zcore.
  // Those injected specifiers can't resolve from a linked package's own
  // directory under pnpm's strict layout, so pin them to our copy.
  const polyfillShims = ["global", "buffer", "process"].map((shim) => ({
    find: new RegExp(`^vite-plugin-node-polyfills/shims/${shim}$`),
    replacement: r(`node_modules/vite-plugin-node-polyfills/shims/${shim}`),
  }));

  return [...crypto, ...generic, ...polyfillShims];
};

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: ".",
  // WXT defaults Firefox to MV2; the background is written for MV3's
  // non-persistent lifecycle (session storage, keep-alive), same as Chrome.
  manifestVersion: 3,

  // AMO reviewers rebuild from the sources zip, which needs the workspace
  // root (lockfile, @zillions/zcore) rather than just this app.
  zip: {
    sourcesRoot: r("../.."),
    excludeSources: [
      "apps/app/**",
      "docs/**",
      "scripts/**",
      "packages/sapling-params/**",
      "packages/zcore/target/**",
      "packages/zcore/patched/**",
      "packages/zcore/.tools/**",
      "apps/keychain/examples/**",
      "**/graphify-out/**",
    ],
  },

  webExt: {
    // This forces the dev browser to reuse the same profile directory
    // keeping cookies, localStorage, and IndexedDB safe between sessions.
    chromiumArgs: ["--user-data-dir=./.wxt/dev-profile"],
  },

  // The background is bundled as a single file, where Vite inlines every
  // asset as base64; that pushed background.js past AMO's 5 MB limit. Ship
  // the wasm at fixed paths instead and load it via `runtime.getURL`.
  hooks: {
    "build:publicAssets": (_, files) => {
      files.push(
        {
          absoluteSrc: r("src/packages/crypto/src/crypto/crypto_bg.wasm"),
          relativeDest: "wasm/crypto_bg.wasm",
        },
        {
          absoluteSrc: r("../../packages/zcore/pkg/zcore_bg.wasm"),
          relativeDest: "wasm/zcore_bg.wasm",
        },
      );
    },
  },

  manifest: ({ browser, mode }) => ({
    name: "Zillions Keychain",
    description:
      "The Zillions Keychain manages a user's wallet for the Zcash ecosystem.",
    version: pkg.version,
    // `tabs` lets the background find/focus an already-open Setup tab by URL
    // (browser.tabs.query({ url })) instead of opening duplicates. `idle`
    // drives auto-lock and shows no install warning. On Chrome,
    // `unlimitedStorage` keeps the vault's IndexedDB out of quota eviction,
    // which would otherwise delete the wallet under disk pressure; it has no
    // install warning there. Firefox never evicts extension data, and would
    // ask for it at install.
    permissions: [
      "storage",
      "tabs",
      "idle",
      ...(browser === "firefox" ? [] : ["unlimitedStorage"]),
    ],
    // The passkey RP claim: ceremonies in extension pages may pass
    // `rpId: keychain.zillions.money` because this permission covers it.
    // Derived from the same constant the ceremonies use (see
    // `passkey-constants.ts`), so the manifest cannot drift from the code.
    // Kept to the single RP host, from which nothing is ever served, so it
    // grants no access to any page in use.
    host_permissions: rpHostPermissions(RP_ID),
    // The RP-claiming feature itself: Chrome 122+ (and forks tracking it)
    // allow an extension page to use an RP ID its host permissions cover.
    // It also covers the provider's `world: "MAIN"` content script (111+).
    minimum_chrome_version: "122",
    // Toolbar action opens the popup (`entrypoints/popup`). WXT fills in
    // `default_popup` from that entrypoint; we only set the title here. The
    // popup itself redirects to the Setup tab when no wallet exists yet.
    action: {
      default_title: "Zillions Keychain",
    },
    // WebAssembly (@zillions/crypto, @zillions/zcore) compiles in the
    // service worker and extension pages, which the default MV3 CSP
    // (`script-src 'self'`) forbids. `'wasm-unsafe-eval'` is the only addition
    // Chrome MV3 allows for this and is what enables WASM instantiation.
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    // No web_accessible_resources: any entry is fetchable by every site,
    // which detects the wallet by it (and, on Firefox, its URL holds the
    // per-install UUID). The wasm binaries only load in extension contexts.
    icons: {
      16: "icons/favicon-16x16.png",
      32: "icons/favicon-32x32.png",
      // No 48 or 128 px source; exact 4x downscales keep these sharp.
      48: "icons/android-chrome-192x192.png",
      128: "icons/android-chrome-512x512.png",
    },
    ...(browser === "firefox"
      ? {
        browser_specific_settings: {
          gecko: {
            // Firefox keys storage and IndexedDB by this ID; without it every
            // reinstall gets a fresh ID and an empty vault.
            id: "keychain@zillions.heliax.dev",
            // MV3 content scripts need their host permission granted; 127+
            // grants it at install instead of leaving it opt-in. Passkeys
            // need 150+; older versions get an error at the ceremony.
            strict_min_version: "128.0",
            data_collection_permissions: { required: ["none"] },
          },
        },
      }
      : {}),
  }),

  vite: ({ browser, mode }) => ({
    define: {
      "process.env": JSON.stringify(buildProcessEnv(browser, mode)),
      // The Keystone UR libraries branch on the Node version; in the browser
      // there is none.
      "process.version": JSON.stringify(""),
    },
    plugins: [
      tailwindcss(),
      svgr({
        svgrOptions: {
          prettier: false,
          svgo: false,
          titleProp: true,
          ref: true,
        },
        include: "**/*.svg",
      }),
      nodePolyfills({
        globals: { Buffer: true, global: true, process: true },
        protocolImports: true,
        exclude: ["vm"],
      }),
      {
        name: "zillions-alias",
        config() {
          return { resolve: { alias: zillionsAliases() } };
        },
      },
      {
        // Vite inlines wasm-bindgen's default `new URL(..., import.meta.url)`
        // even though we always pass `module_or_path`; see `hooks` above.
        name: "zcore-no-default-wasm-url",
        enforce: "pre",
        transform(code: string, id: string) {
          if (!id.endsWith("/zcore/pkg/zcore.js")) return;
          const fallback = "new URL('zcore_bg.wasm', import.meta.url)";
          if (!code.includes(fallback)) {
            this.error(`zcore.js no longer contains ${fallback}`);
          }
          return code.replace(fallback, "undefined");
        },
      },
    ],
  }),
});
