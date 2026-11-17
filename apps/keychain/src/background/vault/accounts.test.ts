import { describe, expect, it, vi } from "vitest";

vi.mock("webextension-polyfill", () => ({ default: {} }));
vi.mock("@zillions/zcore", () => ({ default: vi.fn() }));

import { VaultStorage } from "../../storage";
import { AccountRepository } from "./accounts";

const REAL = "ab".repeat(32);
const ZEROS = "00".repeat(32);

const record = (id: string, seedFingerprint: string, parentId?: string) => ({
  public: { id, alias: id, address: id, seedFingerprint, parentId },
});

const setup = () => {
  const kv = new Map<string, unknown>([
    [
      "vault",
      {
        data: {
          "key-store": [
            record("ledger", ZEROS),
            record("ledger-shielded", ZEROS, "ledger"),
            record("key-import", ""),
            record("phrase", REAL),
            record("phrase-shielded", REAL, "phrase"),
          ],
        },
      },
    ],
  ]);
  const store = {
    get: async (k: string) => kv.get(k),
    set: async (k: string, v: unknown) => void kv.set(k, v),
  };
  return new AccountRepository(new VaultStorage(store as never), {} as never);
};

const fingerprints = async (repo: AccountRepository) =>
  Object.fromEntries((await repo.findAll()).map((r) => [r.id, r.seedFingerprint]));

describe("replacePlaceholderFingerprints", () => {
  it("gives each seedless wallet one random fingerprint, and only once", async () => {
    const repo = setup();
    await repo.replacePlaceholderFingerprints();
    const after = await fingerprints(repo);

    expect(after.ledger).toMatch(/^[0-9a-f]{64}$/);
    expect(after.ledger).not.toBe(ZEROS);
    expect(after["ledger-shielded"]).toBe(after.ledger);
    expect(after["key-import"]).toMatch(/^[0-9a-f]{64}$/);
    expect(after["key-import"]).not.toBe(after.ledger);
    expect(after.phrase).toBe(REAL);
    expect(after["phrase-shielded"]).toBe(REAL);

    await repo.replacePlaceholderFingerprints();
    expect(await fingerprints(repo)).toEqual(after);
  });
});
