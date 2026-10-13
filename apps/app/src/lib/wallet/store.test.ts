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
        vout: new Map([[2, [{ value: 5, script: Uint8Array.of(1, 2) }]]]),
      },
    ],
  ]),
});

test("a sealed state opens with its viewing key's key, and nothing in it reads as text", async () => {
  const key = await storageKey("uview1ours");
  const sealed = await seal(state(), key);

  expect(new TextDecoder().decode(sealed.data)).not.toContain("tx2");
  expect(await unseal(sealed, key)).toEqual(state());
});

test("another viewing key's key opens nothing", async () => {
  const sealed = await seal(state(), await storageKey("uview1ours"));
  expect(await unseal(sealed, await storageKey("uview1theirs"))).toBe(
    undefined,
  );
});

test("a state of another version is dropped, to sync afresh", async () => {
  const key = await storageKey("uview1ours");
  const old = { ...state(), version: 0 } as unknown as WalletState;
  expect(await unseal(await seal(old, key), key)).toBe(undefined);
});
