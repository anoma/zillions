/**
 * Bytes cross between the site and the Keychain as base64, megabytes per
 * chunk, so both ends use the browser's codec where it has one (Chrome 140+,
 * Firefox 133+). `Uint8Array.from(atob(s), fn)` is ~30x slower than the
 * loop below.
 */

type Native = {
  fromBase64?: (s: string) => Uint8Array;
  prototype: { toBase64?: () => string };
};
const native = Uint8Array as unknown as Native;

export const base64ToBytes = (s: string): Uint8Array => {
  if (native.fromBase64) return native.fromBase64(s);
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

export const bytesToBase64 = (bytes: Uint8Array): string => {
  if (native.prototype.toBase64) {
    return (bytes as unknown as { toBase64: () => string }).toBase64();
  }
  // In pieces: spreading megabytes into one call overflows the stack.
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};
