import { Pczt } from "@zillions/sdk";

// Resolves with the value once document is ready, or undefined if the key is still absent.
// Needed because extensions inject into window after document load.
export function waitForWindowProp<K extends keyof Window>(
  key: K,
): Promise<Window[K] | undefined> {
  if (window[key]) {
    return Promise.resolve(window[key]);
  }

  if (document.readyState === "complete") {
    return Promise.resolve(window[key]);
  }

  return new Promise<Window[K] | undefined>((resolve) => {
    const handler = (event: Event): void => {
      if ((event.target as Document).readyState === "complete") {
        resolve(window[key]);
        document.removeEventListener("readystatechange", handler);
      }
    };
    document.addEventListener("readystatechange", handler);
  });
}

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

const base64ToBytes = (s: string): Uint8Array => {
  const binary = atob(s);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
};

export const pcztToBase64 = (pczt: Pczt): string =>
  bytesToBase64(pczt.serialize());

export const pcztFromBase64 = (s: string): Pczt =>
  Pczt.from_bytes(base64ToBytes(s));

/** Compare dotted numeric versions; suffixes after digits are ignored. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
