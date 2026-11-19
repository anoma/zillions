import { argon2id } from "@zillions/zcore";

import { Argon2Config, CryptoRecord, KdfType } from "./types";
import { initZillionsSdk } from "./zillions";

export type { CryptoRecord } from "./types";
export { KdfType } from "./types";

// Unpadded: the shape of the salts already stored in vaults.
const toBase64 = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/=+$/, "");
const fromBase64 = (b64: string): Uint8Array =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const deriveKey = async (
  password: string,
  { m_cost, t_cost, p_cost, salt }: CryptoRecord["kdf"]["params"],
): Promise<CryptoKey> => {
  await initZillionsSdk();
  const hash = argon2id(password, fromBase64(salt), m_cost, t_cost, p_cost);
  // Stored vaults are keyed with base64 text, not the hash bytes.
  const key = new TextEncoder().encode(toBase64(hash).slice(0, 32));
  return crypto.subtle.importKey("raw", key, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
};

export const encrypt = async (
  plainText: string,
  password: string,
): Promise<CryptoRecord> => {
  const params = {
    ...Argon2Config,
    salt: toBase64(crypto.getRandomValues(new Uint8Array(16))),
  };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const text = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await deriveKey(password, params),
    new TextEncoder().encode(plainText),
  );
  return {
    cipher: { type: "aes-256-gcm", iv, text: new Uint8Array(text) },
    kdf: { type: KdfType.Argon2, params },
  };
};

/** Throws when the password is wrong. */
export const decrypt = async (
  { cipher, kdf }: CryptoRecord,
  password: string,
): Promise<string> => {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(cipher.iv) },
    await deriveKey(password, kdf.params),
    new Uint8Array(cipher.text),
  );
  return new TextDecoder().decode(plain);
};
