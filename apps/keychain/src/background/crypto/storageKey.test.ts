import { expect, it } from "vitest";

import { storageKeyOf } from "./storageKey";

/** How sites derived the key themselves, while they still had the UFVK. */
async function sitesKey(ufvk: string) {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(ufvk),
    "HKDF",
    false,
    ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: encoder.encode("zillions-storage"),
    },
    material,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  return new Uint8Array(await crypto.subtle.exportKey("raw", key));
}

it("is the key sites derived from the UFVK, so their stored wallets still open", async () => {
  const ufvk = "uview1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
  const ours = Uint8Array.from(atob(await storageKeyOf(ufvk)), (c) =>
    c.charCodeAt(0)
  );
  expect(ours).toEqual(await sitesKey(ufvk));
  expect(await storageKeyOf("uview1other")).not.toEqual(await storageKeyOf(ufvk));
});
