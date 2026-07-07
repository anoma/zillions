// Re-export only: the bare '@zillions-sdk/wallet' specifier must survive
// into the bundle — the vite plugin marks it external and the injected
// import map resolves it in the browser.
export * from "@zillions-sdk/wallet";
export { default } from "@zillions-sdk/wallet";
