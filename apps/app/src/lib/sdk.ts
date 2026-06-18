import initWasm, { initThreadPool } from "@chainsafe/webzjs-wallet";
import { singleton } from "./utils";

export const initSdk = singleton(async () => {
  await initWasm();
  await initThreadPool(window.navigator.hardwareConcurrency);
});
