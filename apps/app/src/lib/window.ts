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
