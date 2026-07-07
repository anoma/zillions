// Re-export of the wallet wasm glue. The vite plugin marks this module
// external in app builds and rewrites its id to the /zillions-sdk-wallet/
// URL it copies the raw files to — bundling it would strip the default
// export that workers re-import at runtime.
export * from "./wasm/wallet/zillions_sdk_wallet.js";
export { default } from "./wasm/wallet/zillions_sdk_wallet.js";
