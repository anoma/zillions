/**
 * Vite plugin for the Zillions SDK wallet.
 *
 * Bundling the wallet wasm glue with Rollup is fragile: workers re-import the
 * wallet chunk via walletUrl (= import.meta.url) and call pkg.default() to
 * init wasm, but Rollup strips the default export from the chunk when the app
 * only uses named exports.
 *
 * The fix: don't bundle the glue at all. Mark ./wasm/wallet/zillions_sdk_wallet.js
 * external, rewrite its module id in the output to the /zillions-sdk-wallet/
 * URL, and copy the raw wasm-pack output there as-is. The browser then loads
 * the original unmodified module, which already has export default __wbg_init.
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
import { fileURLToPath } from "url";

import type { Plugin } from "vite";

const WALLET_PREFIX = "/zillions-sdk-wallet";
const PARAMS_PREFIX = "/zillions-sdk-sapling-params";

const WALLET_GLUE = "zillions_sdk_wallet.js";

// The committed wasm-pack output (glue + wasm + worker snippets), shipped
// inside this package.
const walletWasmDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "wasm",
  "wallet",
);

// Optional sibling package holding the Sapling proving params; consumers that
// self-host the params (loadProverParams(url)) may not install it.
function resolveParamsDir(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    return dirname(
      require.resolve("@zillions-sdk/sapling-params/package.json"),
    );
  } catch {
    return undefined;
  }
}

const isWalletGlue = (id: string): boolean =>
  id.endsWith(`/wasm/wallet/${WALLET_GLUE}`);

export function zillionsWallet(): Plugin {
  let outDir = "dist";

  return {
    name: "zillions-sdk-wallet",

    config() {
      return {
        // Prevent Vite from pre-bundling the SDK in dev mode so the glue is
        // served as raw ESM from disk (import.meta.url stays meaningful).
        optimizeDeps: { exclude: ["@zillions/sdk"] },
        build: {
          modulePreload: { polyfill: false },
          rollupOptions: {
            // The glue is served as static files — keep it out of the Rollup
            // graph and point the emitted import at the copied location.
            external: isWalletGlue,
            makeAbsoluteExternalsRelative: false,
            output: {
              paths: (id: string) =>
                isWalletGlue(id) ? `${WALLET_PREFIX}/${WALLET_GLUE}` : id,
            },
          },
        },
      };
    },

    configResolved(config) {
      outDir = config.build.outDir;
    },

    // Copy the wallet wasm output to dist/zillions-sdk-wallet/ after the
    // bundle is written.
    closeBundle() {
      cpSync(walletWasmDir, join(outDir, "zillions-sdk-wallet"), {
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

        // In dev mode Vite serves the glue via /@fs/... but workers may also
        // request it through the /zillions-sdk-wallet/ prefix — serve it from
        // the wasm dir so those requests resolve correctly. The Sapling params
        // package is served the same way under its own prefix.
        const url = req.url ?? "";
        const roots: [string, string | undefined][] = [
          [WALLET_PREFIX, walletWasmDir],
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
