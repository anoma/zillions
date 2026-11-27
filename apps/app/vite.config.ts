import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { version } from "./package.json";
import { voteServers, votingConfigUrls } from "./src/lib/vote";
import {
  firstChunkFrom,
  lastChunk,
  maxHeight,
  treeSize,
} from "./src/lib/wallet/chain/chunks";

/** A year of 75 s blocks. */
const YEAR = (365 * 24 * 60 * 60) / 75;

/**
 * Each pool's first chunk from a year before the indexer's tip: where setup
 * ends. Looked up once per build so no user has to.
 * ponytail: frozen at build time, so an old build reaches further back; it's
 * rebuilt often enough for that not to matter.
 */
async function setupChunks(indexer: string) {
  const pools = ["ironwood", "orchard", "sapling"];
  const last = await Promise.all(
    pools.map(async (pool) => lastChunk(await treeSize(indexer, pool))),
  );
  const tip = Math.max(
    ...(await Promise.all(
      pools.map((pool, i) =>
        last[i] < 0 ? 0 : maxHeight(indexer, pool, last[i]),
      ),
    )),
  );
  const chunks = await Promise.all(
    pools.map((pool, i) => firstChunkFrom(indexer, pool, tip - YEAR, last[i])),
  );
  return Object.fromEntries(pools.map((pool, i) => [pool, chunks[i]]));
}

/**
 * Netlify reads `_headers` from the publish directory. Written at build time
 * so the CSP's `connect-src` follows the deployment's indexer and lightwalletd,
 * plus the vote chain the Vote page reads.
 */
function netlifyHeaders(env: Record<string, string>): Plugin {
  return {
    name: "netlify-headers",
    apply: "build",
    generateBundle() {
      const servers = new Set(
        [
          env.VITE_INDEXER_URL,
          env.VITE_GRPC_URL,
          ...votingConfigUrls,
          ...voteServers,
        ].map((url) => new URL(url).origin),
      );
      const csp = [
        "default-src 'self'",
        // zcore and the prover worker instantiate WebAssembly.
        "script-src 'self' 'wasm-unsafe-eval'",
        // React styles through the CSSOM, which no CSP blocks; this covers
        // libraries that write `style` attributes instead.
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        `connect-src 'self' ${[...servers].join(" ")}`,
        "worker-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "object-src 'none'",
      ].join("; ");
      const headers = [
        "/*",
        `  Content-Security-Policy: ${csp}`,
        "  X-Frame-Options: DENY",
        "  X-Content-Type-Options: nosniff",
        "  Referrer-Policy: no-referrer",
        "  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), hid=()",
        "  Cross-Origin-Opener-Policy: same-origin",
        "  Strict-Transport-Security: max-age=31536000; includeSubDomains",
        "",
        "# Vite names every build asset by its content hash, so a URL never changes meaning.",
        "/assets/*",
        "  Cache-Control: public, max-age=31536000, immutable",
        "",
      ].join("\n");
      this.emitFile({ type: "asset", fileName: "_headers", source: headers });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    define: {
      __APP_VERSION__: JSON.stringify(version),
      // Tests run offline.
      __SETUP_CHUNKS__: JSON.stringify(
        mode === "test"
          ? { ironwood: 0, orchard: 0, sapling: 0 }
          : await setupChunks(env.VITE_INDEXER_URL),
      ),
    },
    plugins: [
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
      }),
      tailwindcss(),
      react(),
      netlifyHeaders(env),
    ],
  };
});
