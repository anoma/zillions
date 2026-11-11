// Fails when pkg/ doesn't load or can't derive an account.
import { readFileSync } from "node:fs";
import init, { derive_account } from "./pkg/zcore.js";

await init({
  module_or_path: readFileSync(new URL("pkg/zcore_bg.wasm", import.meta.url)),
});
const { ufvk } = derive_account("main", new Uint8Array(32), 0);
if (!ufvk?.startsWith("uview1")) throw new Error(`unexpected ufvk: ${ufvk}`);
console.log(`ok: ${ufvk.slice(0, 24)}…`);
