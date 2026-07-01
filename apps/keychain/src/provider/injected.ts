/**
 * MAIN-world bootstrap: sets `window.zc`. Bundled as the unlisted `injected.js`
 * entrypoint and injected by the content script via `injectScript`.
 */
import { InjectedZillions } from "./InjectedZillions";

export function init(zc: InjectedZillions): void {
  if (process.env.NODE_ENV !== "production") {
    if (!window.zc) {
      window.zc = zc;
    }
  } else {
    window.zc = zc;
  }
}

export const startInjected = (): void => {
  const packageVersion = process.env.npm_package_version || "";
  init(new InjectedZillions(packageVersion));
};
