import { expect, test, vi } from "vitest";

// Addresses are their place on the chain, as text.
vi.mock("@zillions/zcore", () => ({
  default: vi.fn(async () => {}),
  gap_limits: () => ({ external: 10, internal: 10 }),
  derive_transparent: (
    _network: string,
    _ufvk: string,
    scope: string,
    from: number,
    count: number,
  ) => Array.from({ length: count }, (_, i) => `${scope}/${from + i}`),
  // A phrase whose shown address is index 10, past the first gap limit.
  derive_account_from_ufvk: () => ({ transparent_index: 10 }),
  parse_transaction: () => ({
    txid: "deposit",
    inputs: [{ txid: "exchange", index: 0 }],
    outputs: [{ index: 0, address: "external/10", value: 5 }],
  }),
}));
vi.mock("./chain/lightwalletd", () => ({
  fetchAddressTransactions: vi.fn(async (address: string) =>
    address === "external/10" ? [{ data: new Uint8Array(), height: 100 }] : [],
  ),
  fetchUtxos: vi.fn(async (addresses: string[]) =>
    addresses.includes("external/10")
      ? [
          {
            address: "external/10",
            txid: "deposit",
            index: 0,
            value: 5,
            height: 100,
          },
        ]
      : [],
  ),
}));

const { fetchAddressTransactions } = await import("./chain/lightwalletd");
const { syncTransparent } = await import("./transparent");

test("a deposit to the shown address past the first gap limit is found", async () => {
  const { view, cache } = await syncTransparent(undefined, "uview", 200);
  expect(view.utxos).toMatchObject([
    { address: "external/10", scope: "external", address_index: 10 },
  ]);
  expect(view.txs).toMatchObject([{ txid: "deposit", receiving: 5n }]);
  expect(cache.chains.external.lastUsed).toBe(10);
});

test("a cache from before still finds what was sent there, from the start", async () => {
  const before = {
    tip: 150,
    final: 140,
    chains: {
      external: { lastUsed: -1, checked: 10 },
      internal: { lastUsed: -1, checked: 10 },
    },
    txs: [],
    utxos: [],
  };
  const { view } = await syncTransparent(before, "uview", 200);
  expect(fetchAddressTransactions).toHaveBeenCalledWith("external/10", 1, 200);
  expect(view.txs).toMatchObject([{ txid: "deposit", receiving: 5n }]);
});
