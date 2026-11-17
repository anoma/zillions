import { test as base } from "@playwright/test";
import type { ZCashKeychainAccount } from "@zillions/keychain-types";
import { derive_account, initSync, seed_fingerprint } from "@zillions/zcore";
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
  viewingKey: derived.ufvk,
  seedFingerprint: seed_fingerprint(seed),
  hdIndex: 0,
};

/** Stands in for the keychain extension's `window.zc`; runs in the page. It refuses every signature. */
function stubKeychain({
  accounts,
  connected,
}: {
  accounts: ZCashKeychainAccount[];
  connected: boolean;
}) {
  const signed: string[] = [];
  Object.assign(globalThis, {
    signRequests: signed,
    zc: {
      // Newer than any minimum the app asks for.
      version: () => "99.0.0",
      isConnected: async () => connected,
      connect: async () => {
        connected = true;
      },
      accounts: async () => accounts,
      defaultAccount: async () => accounts[0],
      sign: async ({ pczt }: { pczt: string }) => {
        signed.push(pczt);
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
        accounts: [transparent, shielded],
        connected,
      });
      await use();
    },
    { auto: true },
  ],
});

export const account = { transparent: transparent.address };
