/**
 * Each account's wallet state, encrypted as one record. The key comes from
 * the account's viewing key, which can rebuild all of it from the chain
 * anyway, so the stored copy is never less private than the key. Nothing
 * else is readable, not even which notes or heights are ours.
 */

import Dexie, { type EntityTable } from "dexie";
import type { WalletState } from "./types";

type Sealed = {
  id: string;
  iv: Uint8Array<ArrayBuffer>;
  data: Uint8Array<ArrayBuffer>;
};

const db = new Dexie("zillions-wallet") as Dexie & {
  accounts: EntityTable<Sealed, "id">;
};

db.version(1).stores({ accounts: "id" });

// The store before encryption, readable by anyone at this browser.
void Dexie.delete("zcrawler").catch(() => {});

const VERSION: WalletState["version"] = 4;

const encoder = new TextEncoder();

/** The AES-GCM key for an account's state, derived from its UFVK; it never leaves this page. */
export async function storageKey(ufvk: string) {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(ufvk),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: encoder.encode("zillions-storage"),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// JSON with the types the state holds that JSON lacks.
const replacer = (_key: string, value: unknown) =>
  value instanceof Map
    ? { $map: [...value] }
    : typeof value === "bigint"
      ? { $bigint: value.toString() }
      : value;

const reviver = (_key: string, value: unknown) => {
  if (typeof value !== "object" || value === null) return value;
  if ("$map" in value) return new Map(value.$map as [unknown, unknown][]);
  if ("$bigint" in value) return BigInt(value.$bigint as string);
  return value;
};

export async function seal(state: WalletState, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = encoder.encode(JSON.stringify(state, replacer));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return { id: state.id, iv, data: new Uint8Array(data) } satisfies Sealed;
}

/** The state in `sealed`; undefined when it's from an older version or `key` doesn't open it. */
export async function unseal(sealed: Sealed, key: CryptoKey) {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: sealed.iv },
      key,
      sealed.data,
    );
    const state: WalletState = JSON.parse(
      new TextDecoder().decode(plain),
      reviver,
    );
    return state.version === VERSION ? state : undefined;
  } catch (err) {
    console.error("[store] stored state unreadable", err);
    return undefined;
  }
}

/** The stored state, or undefined when there's none to use: the wallet syncs afresh. */
export async function loadState(id: string, key: CryptoKey) {
  const sealed = await db.accounts.get(id);
  return sealed && unseal(sealed, key);
}

export async function saveState(state: WalletState, key: CryptoKey) {
  await db.accounts.put(await seal(state, key));
}

export const emptyState = (id: string): WalletState => ({
  version: VERSION,
  id,
  notes: [],
  sent: [],
  scan: { scanned: {}, setupDone: false, sendsRead: [] },
  pending: [],
  blocks: new Map(),
  txs: new Map(),
  swaps: [],
});
