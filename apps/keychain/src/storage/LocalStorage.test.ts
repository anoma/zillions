import { describe, expect, it } from "vitest";

import { LocalStorage } from "./LocalStorage";

const storage = (initial: Record<string, unknown> = {}) => {
  const kv = new Map(Object.entries(initial));
  const store = {
    get: async (k: string) => kv.get(k),
    set: async (k: string, v: unknown) => void kv.set(k, v),
  };
  return { kv, storage: new LocalStorage(store as never) };
};

const grant = { accounts: ["w"], current: "w" };

describe("connections", () => {
  it("grant nothing to a plaintext origin off this machine stored earlier", async () => {
    const { kv, storage: s } = storage({
      zillionsExtensionConnections: {
        "http://app.zillions.money": grant,
        "https://app.zillions.money": grant,
        "http://localhost:5173": grant,
      },
    });
    expect(Object.keys(await s.getConnections())).toEqual([
      "https://app.zillions.money",
      "http://localhost:5173",
    ]);

    // The next write drops it for good.
    await s.setConnection("https://other.example", grant);
    expect(Object.keys(kv.get("zillionsExtensionConnections") as object)).not.toContain(
      "http://app.zillions.money"
    );
  });
});

describe("change indexes", () => {
  it("forget only the removed wallet's", async () => {
    const { storage: s } = storage();
    await s.raiseChangeIndex("gone", 1, 7);
    await s.raiseChangeIndex("kept", 1, 3);
    await s.clearChangeIndexes("gone");
    expect(await s.changeIndexes("gone")).toEqual({});
    expect(await s.changeIndexes("kept")).toEqual({ 1: 3 });
  });
});
