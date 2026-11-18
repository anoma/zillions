import { beforeEach, describe, expect, it, vi } from "vitest";

const popups = vi.hoisted(() => [] as { tabId: number }[]);

vi.mock("webextension-polyfill", () => {
  let nextId = 100;
  const browser = {
    windows: {
      create: async ({ url }: { url: string }) => {
        const tabId = ++nextId;
        popups.push({ tabId });
        return { id: tabId, tabs: [{ id: tabId, url }] };
      },
      update: async () => ({}),
      remove: async () => undefined,
    },
    tabs: { remove: async () => undefined },
    action: { setBadgeText: async () => undefined },
    runtime: {
      getURL: (path: string) => `ext://${path}`,
      getPlatformInfo: async () => ({}),
    },
  };
  return { default: browser, ...browser };
});

const compute = vi.hoisted(() => vi.fn());
vi.mock("../compute/host", () => ({ compute }));

const built = vi.hoisted(() => [] as unknown[][]);
vi.mock("../crypto/zillions", () => ({
  buildPcztSummary: vi.fn(),
  linkAddress: vi.fn(),
  transparentGapLimits: () => ({ 0: 10, 1: 5 }),
  buildPczt: vi.fn(async (...args: unknown[]) => {
    built.push(args);
    return "unsigned";
  }),
  buildClaimPczt: vi.fn(async () => "claim"),
  freshAddress: vi.fn(async (ufvk: string) => `fresh-of-${ufvk}`),
  shownTransparentIndex: vi.fn(async () => 3),
  transparentAddresses: vi.fn(),
  ufvkPools: vi.fn(async () => ["ironwood", "orchard"]),
}));
vi.mock("../keyring", () => ({ Keyring: class {} }));
vi.mock("../vault", () => ({ VaultService: class {} }));
vi.mock("../vault/accounts", () => ({ AccountRepository: class {} }));

import { LocalStorage } from "../../storage/LocalStorage";
import { ApprovalsService } from "./service";

const SITE = "https://app.example";
const TAB = 7;

const account = (fields: { id: string; address: string } & Record<string, unknown>) => ({
  alias: "Main",
  path: { account: 0 },
  seedFingerprint: "ff",
  ...fields,
});
const records = [
  account({ id: "Main", address: "t-main", type: "mnemonic", owner: "t-main" }),
  account({
    id: "Main-z",
    parentId: "Main",
    address: "u-main",
    type: "shielded-keys",
    owner: "uview-main",
    path: { account: 4 },
  }),
  account({ id: "Other", address: "t-other", type: "mnemonic", owner: "t-other" }),
  account({
    id: "Other-z",
    parentId: "Other",
    address: "u-other",
    type: "shielded-keys",
    owner: "uview-other",
  }),
];

let svc: ApprovalsService;
let storage: LocalStorage;
let locked = false;
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

beforeEach(async () => {
  popups.length = 0;
  built.length = 0;
  compute.mockReset();
  const kv = new Map<string, unknown>();
  locked = false;
  storage = new LocalStorage({
    get: async (k: string) => kv.get(k),
    set: async (k: string, v: unknown) => void kv.set(k, v),
  } as never);
  await storage.setConnection(SITE, { accounts: ["Main"], current: "Main" });
  svc = new ApprovalsService(
    storage,
    {
      isLocked: async () => locked,
      requiresAuth: async () => false,
    } as never,
    {
      findAll: async () => records,
      findById: async (id: string) => records.find((r) => r.id === id),
      findByAddress: async (a: string) => records.find((r) => r.address === a),
      getActiveAccount: async () => undefined,
    } as never,
    {
      viewingKey: async () => "uview-main",
      sign: async (pczt: string) => `signed-${pczt}`,
    } as never,
    { record: async () => undefined } as never
  );
});

describe("the account's viewing key", () => {
  it("never reaches the site, which still gets its wallet's details", async () => {
    const accounts = await svc.dappAccounts(SITE);
    expect(accounts.every((a) => !("viewingKey" in a))).toBe(true);
    expect(accounts.find((a) => a.id === "Main-z")).toMatchObject({ hdIndex: 4 });
  });

  it("decrypts the site's chunks with its own account's key", async () => {
    compute.mockResolvedValue({ hits: [] });
    await svc.decryptCompact(SITE, {
      pool: "orchard",
      chunk: 9,
      ciphertexts: "AA==",
      tried: { count: 5, digest: "ab" },
    });
    expect(compute).toHaveBeenCalledWith({
      op: "compact",
      ufvk: "uview-main",
      pool: "orchard",
      chunk: 9,
      body: "AA==",
      from: 5,
      tried: "ab",
    });
  });

  it("names the account by its id", async () => {
    expect(await svc.freshAddress(SITE, "Main-z")).toBe("fresh-of-uview-main");
    await expect(svc.freshAddress(SITE, "u-main")).rejects.toThrow(
      "No such shielded account"
    );
  });

  it("refuses another wallet's account, and a site not connected", async () => {
    const props = { account: "Other-z", pool: "orchard" as const, chunk: 0, ciphertexts: "" };
    await expect(svc.decryptCompact(SITE, props)).rejects.toThrow(
      "No such shielded account"
    );
    await expect(svc.freshAddress("https://evil.example")).rejects.toThrow(
      "has not been approved"
    );
    expect(compute).not.toHaveBeenCalled();
  });

  it("gives the site what it keeps its wallet with", async () => {
    expect(await svc.accountInfo(SITE)).toMatchObject({
      pools: ["ironwood", "orchard"],
      transparentIndex: 3,
    });
    expect(await svc.freshAddress(SITE)).toBe("fresh-of-uview-main");
  });
});

describe("while the Keychain is locked", () => {
  const chunk = { pool: "orchard" as const, chunk: 0, ciphertexts: "" };

  it("lets a connected site sync by default, and nothing else", async () => {
    compute.mockResolvedValue({ hits: [] });
    locked = true;
    await svc.decryptCompact(SITE, chunk);
    await svc.decryptFull(SITE, { ...chunk, memos: "", outgoing: "", hits: [] });
    expect(compute).toHaveBeenCalledTimes(2);
    for (const call of [
      svc.accountInfo(SITE),
      svc.freshAddress(SITE),
      svc.dappAccounts(SITE),
    ]) {
      await expect(call).rejects.toThrow("Keychain is locked");
    }
  });

  it("refuses sync too once the user turns it off", async () => {
    await storage.setSyncWhileLocked(false);
    locked = true;
    await expect(svc.decryptCompact(SITE, chunk)).rejects.toThrow(
      "Keychain is locked"
    );
    locked = false;
    compute.mockResolvedValue({ hits: [] });
    await svc.decryptCompact(SITE, chunk);
    expect(compute).toHaveBeenCalledOnce();
  });

  it("never lets a site that wasn't connected sync", async () => {
    locked = true;
    await expect(svc.decryptCompact("https://evil.example", chunk)).rejects.toThrow(
      "has not been approved"
    );
  });
});

describe("a transaction the site asks for", () => {
  const props = {
    proposal: "cGxhbg==",
    signer: "t-main",
    wallet: { tip: 1, notes: [], utxos: [] },
    trees: {},
  };
  const pendingIds = () => [
    ...(svc as unknown as { pendingTxs: Map<string, unknown> }).pendingTxs.keys(),
  ];

  it("is built with the account's key, approved, signed, then proven", async () => {
    compute.mockImplementation(async (job: { op: string }) =>
      job.op === "prove" ? { txid: "tx", raw: "cmF3", expiry_height: 40 } : null
    );
    const stages: string[] = [];
    const result = svc.approveSend(SITE, props, (s) => stages.push(s), TAB);
    await flush();
    expect(built).toEqual([[props, "uview-main", "ff", 4]]);
    expect(popups).toHaveLength(1);
    expect(compute).not.toHaveBeenCalledWith(expect.objectContaining({ op: "prove" }), expect.anything());

    await svc.submitSignTx(popups[0].tabId, pendingIds()[0], "t-main");
    expect(await result).toEqual({ txid: "tx", raw: "cmF3", expiryHeight: 40 });
    expect(compute).toHaveBeenCalledWith(
      { op: "prove", pczt: "signed-unsigned" },
      expect.any(Function)
    );
  });

  it("is never proven once the user rejects it", async () => {
    compute.mockResolvedValue(null);
    const result = svc.approveSend(SITE, props, () => {}, TAB);
    await flush();
    await svc.rejectSignTx(popups[0].tabId, pendingIds()[0]);
    await expect(result).rejects.toThrow("rejected");
    expect(compute).not.toHaveBeenCalledWith(expect.objectContaining({ op: "prove" }), expect.anything());
  });
});
