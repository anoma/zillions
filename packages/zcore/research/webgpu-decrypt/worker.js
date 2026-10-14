import init, * as wasm from "./pkg/webgpu_decrypt_bench.js";

const ready = init();
onmessage = async ({ data }) => {
  await ready;
  if (data === "full") postMessage(wasm.full());
  else postMessage(wasm.setup(data.n, data.scalars).length);
};
