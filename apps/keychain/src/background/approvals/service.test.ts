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
vi.mock("../crypto/zillions", () => ({
  buildPcztSummary: vi.fn(),
  linkAddress: vi.fn(),
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
}

let svc: TestService;

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
  svc = new TestService(
    new LocalStorage(store as never),
    {
      isLocked: async () => false,
      passwordInitialized: async () => true,
      requiresAuth: async () => false,
    } as never,
    {
      findById: async (id: string) => (id === wallet.id ? wallet : undefined),
    } as never,
    {} as never,
    { record: async () => undefined } as never
  );
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
