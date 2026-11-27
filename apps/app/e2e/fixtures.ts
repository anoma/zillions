import { test as base } from "@playwright/test";
import type { ZCashKeychainAccount } from "@zillions/keychain-types";
import {
  derive_account,
  derive_account_from_ufvk,
  derive_transparent,
  fresh_address,
  initSync,
  seed_fingerprint,
  ufvk_pools,
} from "@zillions/zcore";
import { readFileSync } from "node:fs";

initSync({
  module: readFileSync(
    new URL("zcore_bg.wasm", import.meta.resolve("@zillions/zcore")),
  ),
});

/** A throwaway seed, never funded: only the fake chain (chain.ts) pays it. */
const seed = new Uint8Array(32).fill(1);
const derived = derive_account("main", seed, 0) as {
  ufvk: string;
  transparent: string;
};

const transparent: ZCashKeychainAccount = {
  id: "e2e",
  alias: "E2E",
  address: derived.transparent,
};
const shielded: ZCashKeychainAccount = {
  id: "e2e-shielded",
  parentId: "e2e",
  alias: "E2E",
  address: "",
  seedFingerprint: seed_fingerprint(seed),
  hdIndex: 0,
};

/** What the keychain answers from the account's viewing key, worked out here: the page gets no key. */
const keys = {
  info: {
    pools: ufvk_pools("main", derived.ufvk),
    transparentIndex: derive_account_from_ufvk("main", derived.ufvk)
      .transparent_index,
    storageKey: Buffer.alloc(32, 7).toString("base64"),
  },
  fresh: fresh_address("main", derived.ufvk),
  transparent: {
    external: derive_transparent("main", derived.ufvk, "external", 0, 200),
    internal: derive_transparent("main", derived.ufvk, "internal", 0, 200),
  },
};

/** Stands in for the keychain extension's `window.zc`; runs in the page. It refuses every transaction. */
function stubKeychain({
  account,
  connected,
  keys,
}: {
  account: Record<"transparent" | "shielded", ZCashKeychainAccount>;
  connected: boolean;
  keys: {
    info: unknown;
    fresh: string;
    transparent: Record<"external" | "internal", string[]>;
  };
}) {
  const sent: unknown[] = [];
  const switches: unknown[] = [];
  Object.assign(globalThis, {
    sendRequests: sent,
    switchRequests: switches,
    zc: {
      // Newer than any minimum the app asks for.
      version: () => "99.0.0",
      isConnected: async () => connected,
      connect: async () => {
        connected = true;
      },
      account: async () => account,
      // The picker is the keychain's; the site only learns that it was asked.
      switchAccount: async () => {
        switches.push(true);
      },
      accountInfo: async () => keys.info,
      freshAddress: async () => keys.fresh,
      transparentAddresses: async ({
        scope,
        from,
        count,
      }: {
        scope: "external" | "internal";
        from: number;
        count: number;
      }) => keys.transparent[scope].slice(from, from + count),
      sendTransaction: async (request: unknown) => {
        sent.push(request);
        throw new Error("Rejected in the keychain");
      },
    },
  });
}

export const test = base.extend<{ connected: boolean; keychain: void }>({
  connected: [true, { option: true }],
  keychain: [
    async ({ page, connected }, use) => {
      await page.addInitScript(stubKeychain, {
        account: { transparent, shielded },
        connected,
        keys,
      });
      await use();
    },
    { auto: true },
  ],
});

export const account = { transparent: transparent.address };
