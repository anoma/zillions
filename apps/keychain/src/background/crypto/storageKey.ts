/**
 * The key a site encrypts its copy of an account's wallet with: the HKDF
 * sites derived from the viewing key themselves before the Keychain stopped
 * sharing it, so wallets stored then still open. Raw, base64.
 */
export const storageKeyOf = async (ufvk: string): Promise<string> => {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(ufvk),
    "HKDF",
    false,
    ["deriveBits"]
  );
  const key = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: encoder.encode("zillions-storage"),
    },
    material,
    256
  );
  return btoa(String.fromCharCode(...new Uint8Array(key)));
};
