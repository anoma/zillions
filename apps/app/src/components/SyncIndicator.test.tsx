// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { WalletContext } from "../context/wallet";
import type { SyncProgress } from "../lib/wallet/shielded/phases";
import type { Wallet } from "../lib/wallet/wallet";
import { SyncIndicator } from "./SyncIndicator";

afterEach(cleanup);

function renderIndicator() {
  let report: (e: SyncProgress) => void = () => {};
  const wallet = {
    subscribeSyncProgress: (cb: typeof report) => {
      report = cb;
      return () => {};
    },
    sync: vi.fn(async () => {}),
    resync: vi.fn(),
    setSpeedUp: vi.fn(),
    setSpamSync: vi.fn(),
    downloadHistory: vi.fn(),
  };
  render(
    <WalletContext.Provider value={wallet as unknown as Wallet}>
      <SyncIndicator />
    </WalletContext.Provider>,
  );
  return { wallet, report: (e: SyncProgress) => act(() => report(e)) };
}

test("it syncs on mount and checks for new activity first", () => {
  const { wallet } = renderIndicator();
  expect(wallet.sync).toHaveBeenCalledOnce();
  expect(screen.getByText("Checking for new activity")).toBeTruthy();
});

test("setup shows its percentage", () => {
  const { report } = renderIndicator();
  report({ phase: "setup", syncing: true, percentage: 42 });
  expect(screen.getByText("Setting up your wallet: 42%")).toBeTruthy();
});

test("a recent phase that stopped syncing failed, and a click retries", () => {
  const { wallet, report } = renderIndicator();
  report({ phase: "catch-up", syncing: false });
  expect(
    screen.getByText("Shielded sync stopped. Click to retry."),
  ).toBeTruthy();
  fireEvent.click(screen.getAllByRole("button").at(-1)!);
  expect(wallet.sync).toHaveBeenCalledTimes(2);
});

test("history can be sped up and slowed down", () => {
  const { wallet, report } = renderIndicator();
  report({ phase: "history", syncing: false, percentage: 10 });
  fireEvent.click(screen.getByRole("button", { name: "Speed up" }));
  expect(wallet.setSpeedUp).toHaveBeenCalledWith(true);

  report({ phase: "history", syncing: false, percentage: 10, spedUp: true });
  fireEvent.click(screen.getByRole("button", { name: "Slow down" }));
  expect(wallet.setSpeedUp).toHaveBeenCalledWith(false);
});

test("paused history downloads on request", () => {
  const { wallet, report } = renderIndicator();
  report({ phase: "paused", syncing: false });
  fireEvent.click(
    screen.getByRole("button", { name: "Download older history" }),
  );
  expect(wallet.downloadHistory).toHaveBeenCalledOnce();
});

test("the spam era starts, resumes and pauses", () => {
  const { wallet, report } = renderIndicator();
  report({ phase: "spam-off", syncing: false });
  fireEvent.click(screen.getByRole("button", { name: "Sync spam era" }));
  expect(wallet.setSpamSync).toHaveBeenLastCalledWith(true);

  report({ phase: "spam-off", syncing: false, percentage: 30 });
  expect(screen.getByRole("button", { name: "Resume spam era" })).toBeTruthy();

  report({ phase: "spam", syncing: false, percentage: 31 });
  fireEvent.click(screen.getByRole("button", { name: "Pause spam era sync" }));
  expect(wallet.setSpamSync).toHaveBeenLastCalledWith(false);
});

test("done says so", () => {
  const { report } = renderIndicator();
  report({ phase: "done", syncing: false });
  expect(screen.getByText("Shielded sync completed")).toBeTruthy();
});
