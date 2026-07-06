import browser from "webextension-polyfill";
import { KVStore } from "./types";

export class SessionKVStore<T> implements KVStore<T[]> {
  constructor(private readonly _prefix: string) {}

  public async get<T = unknown>(key: string): Promise<T | undefined> {
    const obj = await browser.storage.session.get(this.prefix());
    const bucket = obj[this.prefix()] as Record<string, T> | undefined;
    if (bucket && bucket.hasOwnProperty(key)) {
      return bucket[key];
    }
    return undefined;
  }

  public async set<T = unknown>(key: string, data: T | null): Promise<void> {
    const obj = await browser.storage.session.get(this.prefix());
    const bucket = (obj[this.prefix()] as Record<string, unknown>) ?? {};
    await browser.storage.session.set({
      [this.prefix()]: { ...bucket, [key]: data },
    });
  }

  public prefix(): string {
    return this._prefix;
  }
}
