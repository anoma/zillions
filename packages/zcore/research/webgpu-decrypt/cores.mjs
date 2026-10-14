// `node cores.mjs [n]`: orchard batch decrypt on every core at once (what sync
// runs today), as µs per output. The browser page's workers get throttled when
// the tab is hidden, so the all-core baseline comes from here.
import { readFileSync } from "node:fs";
import { availableParallelism, cpus } from "node:os";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { initSync, setup, full } from "./pkg/webgpu_decrypt_bench.js";

const n = Number(process.argv[2] ?? 16384);
if (isMainThread) {
  const cores = availableParallelism();
  const ws = Array.from({ length: cores }, () => new Worker(new URL(import.meta.url), { workerData: n, argv: [n] }));
  const call = (w, m) => new Promise((r) => (w.once("message", r), w.postMessage(m)));
  await Promise.all(ws.map((w) => call(w, "setup")));
  const ts = [];
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    await Promise.all(ws.map((w) => call(w, "full")));
    ts.push(performance.now() - t);
  }
  const wall = ts.toSorted((a, b) => a - b)[1];
  console.log(`${cpus()[0].model}, ${cores} workers × ${n} outputs: ${wall.toFixed(0)} ms = ${((wall / (cores * n)) * 1000).toFixed(1)} µs/output`);
  ws.forEach((w) => w.terminate());
} else {
  initSync({ module: readFileSync(new URL("pkg/webgpu_decrypt_bench_bg.wasm", import.meta.url)) });
  parentPort.on("message", (m) => parentPort.postMessage(m === "setup" ? setup(workerData, new Uint8Array(64).fill(1, 0, 1).fill(2, 32, 33)).length : full()));
}
