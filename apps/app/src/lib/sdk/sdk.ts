import initWasm, { initThreadPool } from "@zillions-sdk/wallet";
import { singleton } from "../utils";

export const initSdk = singleton(async () => {
  await initWasm();
  await initThreadPool(window.navigator.hardwareConcurrency);
});
