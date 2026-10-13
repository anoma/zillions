import browser from "webextension-polyfill";
import { KVStore } from "./types";

export class SessionKVStore<T> implements KVStore<T[]> {
  constructor(private readonly _prefix: string) {}

  public async get<T = unknown>(key: string): Promise<T | undefined> {
    const k = this.prefix() + "/" + key;

    const obj = await browser.storage.session.get(k);
    return obj[k] as T | undefined;
  }

  // One storage item per key: a read-modify-write of a shared bucket lets
  // concurrent writers restore each other's stale values (e.g. undo a lock).
  public set<T = unknown>(key: string, data: T | null): Promise<void> {
    const k = this.prefix() + "/" + key;

    if (data === null) {
      return browser.storage.session.remove(k);
    }
    return browser.storage.session.set({ [k]: data });
  }

  public prefix(): string {
    return this._prefix;
  }
}
