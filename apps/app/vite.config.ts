import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { version } from "./package.json";
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

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    // Tests run offline.
    __SETUP_CHUNKS__: JSON.stringify(
      mode === "test"
        ? { ironwood: 0, orchard: 0, sapling: 0 }
        : await setupChunks(loadEnv(mode, process.cwd()).VITE_INDEXER_URL),
    ),
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    tailwindcss(),
    react(),
  ],
}));
