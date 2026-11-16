// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ZCashKeychainAccount } from "@zillions/keychain-types";
import { afterEach, expect, test, vi } from "vitest";
import { useAccount } from "../hooks/useAccount";
import type { Keychain } from "../lib/keychain/keychain";
import { KeychainWall } from "./KeychainWall";

afterEach(() => {
  cleanup();
  delete window.zc;
});

const transparent: ZCashKeychainAccount = {
  id: "t",
  alias: "Main",
  address: "t1test",
};
const shielded: ZCashKeychainAccount = {
  id: "z",
  parentId: "t",
  alias: "Main",
  address: "u1test",
  viewingKey: "uview1test",
  seedFingerprint: "00",
  hdIndex: 0,
};

function stubKeychain(overrides: Partial<Keychain> = {}) {
  const zc = {
    version: () => "0.2.1",
    isConnected: async () => true,
    connect: vi.fn(async () => {}),
    accounts: async () => [transparent, shielded],
    defaultAccount: async () => transparent,
    ...overrides,
  };
  window.zc = zc as unknown as typeof window.zc;
  return zc;
}

function Wallet() {
  return <p>Wallet for {useAccount().shielded.viewingKey}</p>;
}

const renderWall = (claiming?: boolean) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <KeychainWall claiming={claiming}>
        <Wallet />
      </KeychainWall>
    </QueryClientProvider>,
  );

test("without a keychain it links to the extension and holds back Connect", () => {
  renderWall();
  expect(screen.getByText("Connect Keychain")).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Get the extension" })
      .getAttribute("href"),
  ).toBe("https://zillions.money/zillions-keychain");
  expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
});

test("only a payment link adds the claim as a third step", () => {
  renderWall();
  expect(screen.queryByText("Claim funds")).toBeNull();
  cleanup();
  renderWall(true);
  expect(screen.getByText("Claim funds")).toBeTruthy();
});

test("an outdated keychain asks for a newer one", () => {
  stubKeychain({ version: () => "0.2.0" });
  renderWall();
  expect(screen.getByText("Keychain outdated")).toBeTruthy();
});

test("a keychain not yet connected connects on click", async () => {
  let connected = false;
  const zc = stubKeychain({
    isConnected: async () => connected,
    connect: vi.fn(async () => {
      connected = true;
    }),
  });
  renderWall();
  fireEvent.click(await screen.findByRole("button", { name: "Connect" }));
  expect(await screen.findByText("Wallet for uview1test")).toBeTruthy();
  expect(zc.connect).toHaveBeenCalledOnce();
});

test("with no accounts it asks to create one", async () => {
  stubKeychain({ accounts: async () => [] });
  renderWall();
  expect(await screen.findByText("Create account")).toBeTruthy();
});

test("with no default account it asks to select one", async () => {
  // The keychain answers null, though its type says undefined.
  stubKeychain({ defaultAccount: async () => null as never });
  renderWall();
  expect(await screen.findByText("Select account")).toBeTruthy();
});

test("an account shared without its viewing key is an error", async () => {
  stubKeychain({
    accounts: async () => [transparent, { ...shielded, viewingKey: undefined }],
  });
  renderWall();
  expect(
    await screen.findByText(
      "The keychain did not share this account's viewing key",
    ),
  ).toBeTruthy();
});

test("a connected account with its keys reaches the wallet", async () => {
  stubKeychain();
  renderWall();
  expect(await screen.findByText("Wallet for uview1test")).toBeTruthy();
});
