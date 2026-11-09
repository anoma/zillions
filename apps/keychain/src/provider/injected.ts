/**
 * MAIN-world bootstrap: sets `window.zc`. Run by the MAIN-world content script
 * `entrypoints/injected.content.ts`.
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
