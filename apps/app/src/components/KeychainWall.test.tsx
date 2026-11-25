// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ZCashKeychainAccount } from "@zillions/keychain-types";
import { afterEach, expect, test, vi } from "vitest";
import { useAccount } from "../hooks/useAccount";
import { KeychainEvent, type Keychain } from "../lib/keychain/keychain";
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
  seedFingerprint: "00",
  hdIndex: 0,
};

function stubKeychain(overrides: Partial<Keychain> = {}) {
  const zc = {
    version: () => "0.15.0",
    isConnected: async () => true,
    connect: vi.fn(async () => {}),
    account: async () => ({ transparent, shielded }),
    ...overrides,
  };
  window.zc = zc as unknown as typeof window.zc;
  return zc;
}

function Wallet() {
  return <p>Wallet for {useAccount().shielded.address}</p>;
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
  stubKeychain({ version: () => "0.14.0" });
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
  expect(await screen.findByText("Wallet for u1test")).toBeTruthy();
  expect(zc.connect).toHaveBeenCalledOnce();
});

test("a locked keychain asks to unlock, not to connect", async () => {
  let unlocked = false;
  const zc = stubKeychain({
    isConnected: async () => unlocked,
    isLocked: async () => !unlocked,
    connect: vi.fn(async () => {
      unlocked = true;
    }),
  });
  renderWall();
  fireEvent.click(
    await screen.findByRole("button", { name: "Unlock your Keychain" }),
  );
  expect(screen.queryByText("Connect Keychain")).toBeNull();
  expect(await screen.findByText("Wallet for u1test")).toBeTruthy();
  expect(zc.connect).toHaveBeenCalledOnce();
});

test("a keychain locked after load asks to unlock, then comes back on unlock", async () => {
  let locked = true;
  stubKeychain({
    account: async () => {
      if (locked) throw new Error("Keychain is locked");
      return { transparent, shielded };
    },
  });
  renderWall();
  expect(
    await screen.findByRole("button", { name: "Unlock your Keychain" }),
  ).toBeTruthy();
  locked = false;
  window.dispatchEvent(new Event(KeychainEvent.ExtensionUnlocked));
  expect(await screen.findByText("Wallet for u1test")).toBeTruthy();
});

test("unlocking from the toolbar moves on from setup", async () => {
  // An older keychain can't say it's locked, so the wall shows setup.
  let connected = false;
  stubKeychain({ isConnected: async () => connected });
  renderWall();
  expect(await screen.findByRole("button", { name: "Connect" })).toBeTruthy();
  connected = true;
  window.dispatchEvent(new Event(KeychainEvent.ExtensionUnlocked));
  expect(await screen.findByText("Wallet for u1test")).toBeTruthy();
});

test("with no shielded account it asks to select one", async () => {
  stubKeychain({ account: async () => null });
  renderWall();
  expect(await screen.findByText("Select account")).toBeTruthy();
});

test("an account the keychain didn't share is an error", async () => {
  stubKeychain({
    account: async () => ({
      transparent,
      shielded: { ...shielded, hdIndex: undefined },
    }),
  });
  renderWall();
  expect(
    await screen.findByText("The keychain did not share this account"),
  ).toBeTruthy();
});

test("a connected account with its keys reaches the wallet", async () => {
  stubKeychain();
  renderWall();
  expect(await screen.findByText("Wallet for u1test")).toBeTruthy();
});
