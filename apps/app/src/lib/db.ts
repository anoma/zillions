import type { DBSchema, StoreNames, StoreValue } from "idb";
import { openDB } from "idb";

const DB_NAME = "zillions-app";
const DB_VERSION = 1;

// Add new stores here as the app grows. Bump DB_VERSION when you do.
const storeNames = ["wallets"] as const;

interface ZillionsDB extends DBSchema {
  wallets: {
    key: string;
    value: Uint8Array;
  };
}

function getDb() {
  return openDB<ZillionsDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      for (const name of storeNames) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name);
        }
      }
    },
  });
}

export const db = {
  async get<S extends StoreNames<ZillionsDB>>(
    store: S,
    key: string,
  ): Promise<StoreValue<ZillionsDB, S> | undefined> {
    return (await getDb()).get(store, key);
  },

  async set<S extends StoreNames<ZillionsDB>>(
    store: S,
    key: string,
    value: StoreValue<ZillionsDB, S>,
  ): Promise<void> {
    await (await getDb()).put(store, value, key);
  },

  async del<S extends StoreNames<ZillionsDB>>(
    store: S,
    key: string,
  ): Promise<void> {
    await (await getDb()).delete(store, key);
  },
};
