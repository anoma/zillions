import { defineConfig } from "vite";

// Keep the dev port stable: the extension stores the approved origin
// (http://localhost:5173), so a fixed port preserves the "already approved"
// path across reloads. `strictPort` fails loudly instead of drifting to 5174.
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
});
