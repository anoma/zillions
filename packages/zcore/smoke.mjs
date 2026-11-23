// Fails when pkg/ doesn't load or can't derive an account, in either build.
import { readFileSync } from "node:fs";
import init, { derive_account } from "./pkg/zcore.js";
import initThreaded, * as threaded from "./pkg/mt/zcore.js";

const wasm = (path) => readFileSync(new URL(path, import.meta.url));
await init({ module_or_path: wasm("pkg/zcore_bg.wasm") });
await initThreaded({ module_or_path: wasm("pkg/mt/zcore_bg.wasm") });
for (const derive of [derive_account, threaded.derive_account]) {
  const { ufvk } = derive("main", new Uint8Array(32), 0);
  if (!ufvk?.startsWith("uview1")) throw new Error(`unexpected ufvk: ${ufvk}`);
}
console.log("ok: both builds derive an account");
