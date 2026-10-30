/**
 * The web origins the Keychain serves. The content script's `matches`, the
 * page-visible `injected.js` and the background's dapp channels all derive
 * from this list, so no other site can detect or talk to the extension.
 *
 * Free of build-time globals: wxt.config.ts imports it under Node.
 */

export const PRODUCTION_ORIGINS = ["https://app.zillions.money"];

/** Local dev servers: the app (`pnpm app:dev`) and `examples/test-dapp`. */
export const DEVELOPMENT_ORIGINS = ["http://localhost", "http://127.0.0.1"];

export const allowedOrigins = (development: boolean): string[] =>
  development
    ? [...PRODUCTION_ORIGINS, ...DEVELOPMENT_ORIGINS]
    : PRODUCTION_ORIGINS;

/** Manifest match patterns. A pattern without a port matches every port. */
export const matchPatterns = (development: boolean): string[] =>
  allowedOrigins(development).map((origin) => `${origin}/*`);

/** `origin` as `new URL(url).origin` gives it; ports are ignored, as in the manifest. */
export const isAllowedOrigin = (
  origin: string,
  development: boolean
): boolean => {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  return allowedOrigins(development).some((allowed) => {
    const a = new URL(allowed);
    return a.protocol === url.protocol && a.hostname === url.hostname;
  });
};
