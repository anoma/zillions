import { expect, test } from "vitest";

import { emptyState, seal, storageKey, unseal } from "./store";
import type { WalletState } from "./types";

const state = (): WalletState => ({
  ...emptyState("a"),
  pending: [
    {
      txid: "t1",
      expiryHeight: 0,
      nullifiers: [],
      outpoints: [],
      change: 0,
      receipt: {
        tx_type: "Sent",
        value: -3_000n,
        fee: 1_000n,
        from: { pool: "shielded" },
        to: { address: "zs1" },
      },
    },
  ],
  blocks: new Map([
    [
      3_000,
      {
        time: 1,
        txids: new Map([[2, "tx2"]]),
        treeSizes: { sapling: 1, orchard: 2, ironwood: 3 },
        outputs: new Map(),
        transparentInputs: [4],
      },
    ],
  ]),
});

/** A key as the keychain hands it over: 32 bytes, base64. */
const keyOf = (byte: number) =>
  storageKey(btoa(String.fromCharCode(...new Uint8Array(32).fill(byte))));

test("a sealed state opens with its key, and nothing in it reads as text", async () => {
  const key = await keyOf(1);
  const sealed = await seal(state(), key);

  expect(new TextDecoder().decode(sealed.data)).not.toContain("tx2");
  expect(await unseal(sealed, key)).toEqual(state());
});

test("another account's key opens nothing", async () => {
  const sealed = await seal(state(), await keyOf(1));
  expect(await unseal(sealed, await keyOf(2))).toBe(undefined);
});

test("a state of another version is dropped, to sync afresh", async () => {
  const key = await keyOf(1);
  const old = { ...state(), version: 0 } as unknown as WalletState;
  expect(await unseal(await seal(old, key), key)).toBe(undefined);
});
