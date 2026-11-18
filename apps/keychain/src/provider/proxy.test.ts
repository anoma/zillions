import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BackgroundClient } from "../ipc/client";
import { startProxy } from "./proxy";
import { ProxyRequestTypes } from "./types";

const ORIGIN = "https://site.example";
let listener: (e: unknown) => void;
let replies: { id: string; result: { return?: unknown; error?: string } }[];
const activation = { hasBeenActive: false };

beforeEach(() => {
  replies = [];
  activation.hasBeenActive = false;
  const window = {
    location: { origin: ORIGIN },
    addEventListener: (_: string, fn: (e: unknown) => void) => (listener = fn),
    postMessage: (m: (typeof replies)[number]) => replies.push(m),
  };
  vi.stubGlobal("window", window);
  vi.stubGlobal("navigator", { userActivation: activation });
});

const call = async (method: string, args?: unknown) => {
  listener({
    data: { type: ProxyRequestTypes.Request, id: method, method, args },
    source: window,
    origin: ORIGIN,
  });
  await vi.waitFor(() => expect(replies.find((r) => r.id === method)).toBeDefined());
  return replies.find((r) => r.id === method)!.result;
};

describe("the content script relay", () => {
  it("won't open a window for a page the user never touched", async () => {
    const send = vi.fn(async () => true);
    startProxy({ send } as unknown as BackgroundClient);

    expect((await call("connect")).error).toMatch(
      /needs the user to interact with the page first/
    );
    // Reads that open nothing still work.
    expect((await call("isConnected")).return).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("dapp/isConnected", {});
  });

  it("relays it once the user has interacted with the page", async () => {
    const send = vi.fn(async () => undefined);
    startProxy({ send } as unknown as BackgroundClient);
    activation.hasBeenActive = true;

    expect((await call("connect")).error).toBeUndefined();
    expect(send).toHaveBeenCalledWith("dapp/connect", {});
  });

  it("won't start proving for a page the user never touched, but decrypts for it", async () => {
    const send = vi.fn(async () => ({}));
    startProxy({ send } as unknown as BackgroundClient);

    expect((await call("sendTransaction", { kind: "shield" })).error).toMatch(
      /needs the user to interact/
    );
    expect((await call("claimLink", {})).error).toMatch(/needs the user to interact/);
    expect((await call("decryptCompact", { chunk: 1 })).error).toBeUndefined();
    expect(send).toHaveBeenCalledWith("dapp/decryptCompact", { chunk: 1 });
    expect((await call("accountInfo")).error).toBeUndefined();
    expect(send).toHaveBeenCalledWith("dapp/accountInfo", { account: undefined });
    expect(send).toHaveBeenCalledTimes(2);
  });
});
