/**
 * Vite plugin for the Zillions SDK wallet.
 *
 * Bundling the wallet with Rollup is fragile: workers re-import the wallet
 * chunk via walletUrl (= import.meta.url) and call pkg.default() to init wasm,
 * but Rollup strips the default export from the chunk when the app only uses
 * named exports.
 *
 * The fix: don't bundle the wallet at all. Mark it external, copy the raw
 * wasm-pack output (@zillions-sdk/wallet's wasm/ dir) into
 * dist/zillions-sdk-wallet/ as-is, and inject an import map so the browser
 * resolves the bare specifier to the correct URL. Workers then import the
 * original unmodified module, which already has export default __wbg_init.
 *
 * Side effects:
 * - SharedArrayBuffer requires COOP + COEP — injected on dev and preview servers.
 * - modulePreload polyfill injects document.querySelectorAll which crashes in
 *   wasm workers — disabled globally.
 * - The wasm lands at /zillions-sdk-wallet/zillions_sdk_wallet_bg.wasm with no
 *   content hash, so it can be served with long-lived cache headers when the
 *   content is stable.
 */

import { cpSync, createReadStream, statSync } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";

import type { Plugin } from "vite";

const WALLET_PREFIX = "/zillions-sdk-wallet";
const PARAMS_PREFIX = "/zillions-sdk-sapling-params";

const require = createRequire(import.meta.url);

// The committed wasm-pack output (glue + wasm + worker snippets) of the
// wallet package.
const walletWasmDir = (): string =>
  join(dirname(require.resolve("@zillions-sdk/wallet/package.json")), "wasm");

// Optional sibling package holding the Sapling proving params; consumers that
// self-host the params (loadProverParams(url)) may not install it.
function resolveParamsDir(): string | undefined {
  try {
    return dirname(
      require.resolve("@zillions-sdk/sapling-params/package.json"),
    );
  } catch {
    return undefined;
  }
}

export function zillionsWallet(): Plugin {
  let outDir = "dist";

  return {
    name: "zillions-sdk-wallet",

    config() {
      return {
        // Prevent Vite from pre-bundling the wallet in dev mode so it is served
        // as raw ESM from node_modules (import.meta.url stays meaningful).
        optimizeDeps: { exclude: ["@zillions-sdk/wallet"] },
        build: {
          modulePreload: { polyfill: false },
          rollupOptions: {
            // Wallet is served as static files — keep it out of the Rollup graph.
            external: ["@zillions-sdk/wallet"],
          },
        },
      };
    },

    configResolved(config) {
      outDir = config.build.outDir;
    },

    // Inject the import map so the browser resolves the bare specifier.
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { type: "importmap" },
          children: JSON.stringify({
            imports: {
              "@zillions-sdk/wallet": `${WALLET_PREFIX}/zillions_sdk_wallet.js`,
            },
          }),
          injectTo: "head-prepend",
        },
      ];
    },

    // Copy the wallet wasm output to dist/zillions-sdk-wallet/ after the
    // bundle is written.
    closeBundle() {
      cpSync(walletWasmDir(), join(outDir, "zillions-sdk-wallet"), {
        recursive: true,
      });
      const paramsDir = resolveParamsDir();
      if (paramsDir) {
        cpSync(paramsDir, join(outDir, "zillions-sdk-sapling-params"), {
          recursive: true,
        });
      }
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");

        // In dev mode Vite serves the wallet via /@fs/... but workers may also
        // request it through the /zillions-sdk-wallet/ prefix — serve it from
        // the package's wasm dir so those requests resolve correctly. The
        // Sapling params package is served the same way under its own prefix.
        const url = req.url ?? "";
        const roots: [string, string | undefined][] = [
          [WALLET_PREFIX, walletWasmDir()],
          [PARAMS_PREFIX, resolveParamsDir()],
        ];
        for (const [prefix, dir] of roots) {
          if (!dir || !url.startsWith(prefix + "/")) continue;
          const relPath = decodeURIComponent(
            url.slice(prefix.length + 1).split("?")[0],
          );
          const filePath = join(dir, relPath);
          try {
            if (statSync(filePath).isFile()) {
              const ext = relPath.split(".").pop() ?? "";
              res.setHeader(
                "Content-Type",
                ({
                  js: "application/javascript; charset=utf-8",
                  wasm: "application/wasm",
                } as Record<string, string>)[ext] ?? "application/octet-stream",
              );
              createReadStream(filePath).pipe(res);
              return;
            }
          } catch {
            // fall through to next()
          }
        }

        next();
      });
    },

    configurePreviewServer(server) {
      // dist/zillions-sdk-wallet/ is served automatically by vite preview.
      // We only need to add the isolation headers.
      server.middlewares.use((_req, res, next) => {
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        next();
      });
    },
  };
}
