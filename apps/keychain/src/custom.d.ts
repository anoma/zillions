// Vite `?url` imports resolve to a string URL pointing at the emitted asset.
declare module "*.wasm?url" {
  const url: string;
  export default url;
}
