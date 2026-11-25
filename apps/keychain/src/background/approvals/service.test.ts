import { beforeEach, describe, expect, it, vi } from "vitest";

const browserState = vi.hoisted(() => ({
  popups: [] as { url: string; tabId: number }[],
  removedTabs: [] as number[],
  nextId: 100,
}));

vi.mock("webextension-polyfill", () => {
  const browser = {
    windows: {
      create: async ({ url }: { url: string }) => {
        const tabId = ++browserState.nextId;
        browserState.popups.push({ url, tabId });
        return { id: tabId, tabs: [{ id: tabId, url }] };
      },
      update: async () => ({}),
      remove: async () => undefined,
    },
    tabs: {
      remove: async (tabId: number) => {
        browserState.removedTabs.push(tabId);
      },
    },
    action: { setBadgeText: async () => undefined },
    runtime: {
      getURL: (path: string) => `ext://${path}`,
      getPlatformInfo: async () => ({}),
    },
  };
  return { default: browser, ...browser };
});
const summaries = vi.hoisted(() => ({ next: undefined as unknown }));
vi.mock("../crypto/zillions", () => ({
  buildPcztSummary: vi.fn(async () => summaries.next),
  linkAddress: vi.fn(),
  transparentGapLimits: () => ({ 0: 10, 1: 5 }),
}));
vi.mock("../keyring", () => ({ Keyring: class {} }));
vi.mock("../vault", () => ({ VaultService: class {} }));
vi.mock("../vault/accounts", () => ({ AccountRepository: class {} }));

import { LocalStorage } from "../../storage/LocalStorage";
import { ApprovalsService } from "./service";

const A = "https://a.example";
const B = "https://b.example";
const TAB = 7;

const wallet = {
  id: "Main",
  alias: "Main",
  address: "t-main",
  type: "mnemonic",
  owner: "xpub",
  path: { account: 0 },
};

/** The service with its clock under the test's control. */
class TestService extends ApprovalsService {
  clock = 1_000_000;
  protected override now = (): number => this.clock;
  park(msgId: string, signer: string): void {
    this.pendingTxs.set(msgId, { pczt: "", signer });
  }
  parkLink(msgId: string, signer: string): void {
    this.pendingLinks.set(msgId, { sealed: "s", nk: "n", signer });
  }
}

let storage: LocalStorage;
const opened: string[] = [];

let svc: TestService;
let locked: boolean;

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

/** Starts a Connect request; resolves once its window (if any) exists. */
const askToConnect = async (origin: string, tabId = TAB) => {
  const before = browserState.popups.length;
  const result = svc.approveConnection(origin, tabId).then(
    () => "connected",
    (e: Error) => e.message
  );
  await flush();
  const popup = browserState.popups.length > before ? browserState.popups.at(-1) : undefined;
  return { result, popup };
};

beforeEach(() => {
  browserState.popups.length = 0;
  browserState.removedTabs.length = 0;
  const kv = new Map<string, unknown>();
  const store = {
    get: async (k: string) => kv.get(k),
    set: async (k: string, v: unknown) => void kv.set(k, v),
  };
  storage = new LocalStorage(store as never);
  opened.length = 0;
  locked = false;
  svc = new TestService(
    storage,
    {
      isLocked: async () => locked,
      passwordInitialized: async () => true,
      requiresAuth: async () => false,
      checkPassword: async (password: string) => password === "right",
    } as never,
    {
      findById: async (id: string) => (id === wallet.id ? wallet : undefined),
      findByAddress: async (a: string) => (a === wallet.address ? wallet : undefined),
    } as never,
    {
      viewingKey: async () => "uview",
      sign: async () => "signed",
      openLinkKey: async (sealed: string) => {
        opened.push(sealed);
        return "the-key";
      },
    } as never,
    { record: async () => undefined } as never
  );
});

describe("isLocked", () => {
  it("tells only a connected site that the Keychain is locked", async () => {
    await storage.setConnection(A, { accounts: [wallet.id], current: wallet.id });
    expect(await svc.isLockedFor(A)).toBe(false);
    locked = true;
    expect(await svc.isLockedFor(A)).toBe(true);
    expect(await svc.isLockedFor(B)).toBe(false);
  });
});

describe("a dismissed window makes its site wait", () => {
  it("refuses the site's next window after a Reject, then lets it ask again", async () => {
    const { result, popup } = await askToConnect(A);
    await svc.resolveConnection(popup!.tabId, A, false);
    expect(await result).toBe("Connection request rejected");

    expect((await askToConnect(A)).popup).toBeUndefined();
    expect(await (await askToConnect(A)).result).toMatch(/dismissed/);

    svc.clock += 3_000;
    expect((await askToConnect(A)).popup).toBeDefined();
  });

  it("waits longer each time in a row, and only for that site", async () => {
    for (const wait of [3_000, 10_000, 30_000, 60_000, 120_000, 300_000, 300_000]) {
      const { result, popup } = await askToConnect(A);
      svc.handleTabRemoved(popup!.tabId);
      expect(await result).toBe("Window closed");
      svc.clock += wait - 1;
      expect(await (await askToConnect(A)).result).toMatch(/dismissed/);
      svc.clock += 1;
    }
    expect((await askToConnect(B, 8)).popup).toBeDefined();
  });

  it("forgets the count once the user approves", async () => {
    const first = await askToConnect(A);
    svc.handleTabRemoved(first.popup!.tabId);
    await first.result;
    svc.clock += 3_000;

    const second = await askToConnect(A);
    await svc.resolveConnection(second.popup!.tabId, A, true, wallet.id);
    expect(await second.result).toBe("connected");
    await svc.revokeConnection(A);

    const third = await askToConnect(A);
    svc.handleTabRemoved(third.popup!.tabId);
    await third.result;
    // Back to the first, shortest wait.
    svc.clock += 3_000;
    expect((await askToConnect(A)).popup).toBeDefined();
  });
});

describe("a request belongs to the tab that made it", () => {
  it("closes its window when the tab closes", async () => {
    const { result, popup } = await askToConnect(A);
    svc.handleTabRemoved(TAB);
    expect(await result).toBe("The page that asked is gone");
    expect(browserState.removedTabs).toContain(popup!.tabId);
  });

  it("closes its window when the tab leaves the site, not on in-page navigation", async () => {
    const { result, popup } = await askToConnect(A);
    svc.handleTabUpdated(TAB, `${A}/send#step-2`);
    await flush();
    expect(browserState.removedTabs).not.toContain(popup!.tabId);

    svc.handleTabUpdated(TAB, `${B}/`);
    expect(await result).toBe("The page that asked is gone");
    expect(browserState.removedTabs).toContain(popup!.tabId);
  });

  it("drops a queued request, so one tab can't hold several sites' slots", async () => {
    const holder = await askToConnect(A, 1);
    const queued = await askToConnect(B, TAB);
    expect(queued.popup).toBeUndefined();

    svc.handleTabUpdated(TAB, "https://c.example/");
    expect(await queued.result).toBe("The page that asked is gone");

    // Its slot is free again, and it never opened a window.
    svc.handleTabRemoved(holder.popup!.tabId);
    await holder.result;
    await flush();
    expect(browserState.popups).toHaveLength(1);
  });

  it("isn't counted as a dismissal", async () => {
    await askToConnect(A);
    svc.handleTabRemoved(TAB);
    await flush();
    expect((await askToConnect(A, 9)).popup).toBeDefined();
  });
});

describe("payment links", () => {
  it("opens a link only with the password, and a wrong one can be retried", async () => {
    const result = new Promise<string>((resolve, reject) => {
      (svc as unknown as { resolverMap: Record<number, unknown> }).resolverMap[5] = {
        meta: { origin: "https://app.zillions.money", kind: "open-link" },
        resolve,
        reject,
      };
    });
    svc.parkLink("m", wallet.address);

    expect(await svc.submitOpenLinkKey(5, "m", "wrong").catch((e: Error) => e.message)).toBe(
      "Incorrect password"
    );
    expect(opened).toEqual([]);

    await svc.submitOpenLinkKey(5, "m", "right");
    expect(await result).toBe("the-key");
  });
});

describe("transparent change", () => {
  const output = (scope: number, index: number, value = "9000") => ({
    address: "t1x",
    value,
    mine: true,
    path: { scope, index },
  });
  const summary = (...outputs: ReturnType<typeof output>[]) => ({
    transparentOutputs: outputs,
    saplingOutputs: [],
    orchardOutputs: [],
    ironwoodOutputs: [],
  });
  const query = async (msgId: string, ...outputs: ReturnType<typeof output>[]) => {
    summaries.next = summary(...outputs);
    svc.park(msgId, wallet.address);
    return svc.queryPcztSummary(msgId);
  };
  /** The site's request, summarised and approved in its window. */
  const approve = async (msgId: string, ...outputs: ReturnType<typeof output>[]) => {
    await query(msgId, ...outputs);
    void new Promise((resolve, reject) => {
      (svc as unknown as { resolverMap: Record<number, unknown> }).resolverMap[50] = {
        meta: { origin: A, kind: "sign-tx" },
        resolve,
        reject,
      };
    });
    await svc.submitSignTx(50, msgId, wallet.address);
    await flush();
  };

  beforeEach(async () => {
    await storage.setConnection(A, { accounts: [wallet.id], current: wallet.id });
  });

  it("is flagged past the addresses approved so far plus the gap wallets scan", async () => {
    expect((await query("a", output(1, 4))).unusualChange).toBeUndefined();
    expect((await query("b", output(1, 5))).unusualChange).toEqual([
      { scope: 1, index: 5, value: "9000", known: false },
    ]);

    // Once address 38 has been approved, the next few are expected.
    await storage.raiseChangeIndex(wallet.id, 1, 38);
    expect((await query("c", output(1, 43))).unusualChange).toBeUndefined();
    expect((await query("c2", output(1, 44))).unusualChange).toEqual([
      { scope: 1, index: 44, value: "9000", known: true },
    ]);
  });

  it("names every stray output, so dust can't stand in for the rest", async () => {
    const { unusualChange } = await query("d", output(1, 6, "10000"), output(1, 87, "989980000"));
    expect(unusualChange).toEqual([
      { scope: 1, index: 6, value: "10000", known: false },
      { scope: 1, index: 87, value: "989980000", known: false },
    ]);
  });

  it("takes a first send's index as the mark, so a restored wallet's next send is expected", async () => {
    await approve("e", output(1, 40));
    expect(await storage.changeIndexes(wallet.id)).toEqual({ 1: 40 });
    expect((await query("f", output(1, 41))).unusualChange).toBeUndefined();
  });

  it("moves a known mark at most one gap, whatever index the user accepted", async () => {
    await storage.raiseChangeIndex(wallet.id, 1, 2);
    await approve("e2", output(1, 6, "10000"), output(1, 87));
    expect(await storage.changeIndexes(wallet.id)).toEqual({ 1: 7 });
    expect((await query("f2", output(1, 87))).unusualChange).toMatchObject([
      { index: 87, known: true },
    ]);
  });

  it("shows an output of ours past the ceiling as a payment", async () => {
    const { transparentOutputs, unusualChange } = await query("g", output(1, 100));
    expect(transparentOutputs[0]).toMatchObject({ mine: false, path: undefined });
    expect(unusualChange).toBeUndefined();
    expect((await query("h", output(1, 99))).transparentOutputs[0]).toMatchObject({ mine: true });
  });
});
