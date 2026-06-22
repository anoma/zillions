export function singleton<T>(fn: () => Promise<T>): () => Promise<T> {
  let instance: Promise<T> | undefined;
  return () => (instance ??= fn());
}

export function dedupe<T>(fn: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | undefined;
  return () => {
    if (!inflight) {
      inflight = fn().finally(() => {
        inflight = undefined;
      });
    }
    return inflight;
  };
}

export const shortenAddress = (
  address: string,
  prefixLength = 8,
  suffixLength = 6,
  delimiter = "...",
): string => {
  if (address.length <= prefixLength + suffixLength) {
    return address;
  }
  const prefix = address.substring(0, prefixLength);
  const suffix = address.substring(
    address.length - suffixLength,
    address.length,
  );
  return [prefix, delimiter, suffix].join("");
};
