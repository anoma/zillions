import { beforeEach, expect, test, vi } from "vitest";

// Addresses are their place on the chain, as text.
vi.mock("../keychain/keychain", () => ({
  keychain: () => ({
    transparentAddresses: async ({
      scope,
      from,
      count,
    }: {
      scope: string;
      from: number;
      count: number;
    }) => Array.from({ length: count }, (_, i) => `${scope}/${from + i}`),
  }),
}));
vi.mock("@zillions/zcore", () => ({
  default: vi.fn(async () => {}),
  gap_limits: () => ({ external: 10, internal: 10 }),
  parse_transaction: () => ({
    txid: "deposit",
    inputs: [{ txid: "exchange", index: 0 }],
    outputs: [{ index: 0, address: "external/10", value: 5 }],
  }),
}));
// The deposit is at height 100: only a lookup from at or below it finds it.
vi.mock("./chain/lightwalletd", () => ({
  fetchAddressTransactions: vi.fn(async (address: string, from: number) =>
    address === "external/10" && from <= 100
      ? [{ data: new Uint8Array(), height: 100 }]
      : [],
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

beforeEach(() => vi.clearAllMocks());

// A phrase whose shown address is index 10, past the first gap limit.
test("a deposit to the shown address past the first gap limit is found", async () => {
  const { view, cache } = await syncTransparent(undefined, "u1", 200, 10);
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
  const { view } = await syncTransparent(before, "u1", 200, 10);
  expect(view.txs).toMatchObject([{ txid: "deposit", receiving: 5n }]);
});

test("a shown address in the first gap limit asks about no more addresses", async () => {
  await syncTransparent(undefined, "u1", 200, 0);
  expect(fetchAddressTransactions).toHaveBeenCalledTimes(20);
});
