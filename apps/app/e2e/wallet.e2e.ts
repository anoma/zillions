import { expect } from "@playwright/test";
import { account, test } from "./fixtures";

// The fake chain (chain.ts) holds 0.01 ZEC in one transparent coin and nothing shielded.

test.describe("not connected", () => {
  test.use({ connected: false });

  test("connecting shows the balances", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Connect" }).click();
    const balance = page.getByRole("region", { name: "Total balance" });
    await expect(balance).toContainText("0.01 ZEC");
    await expect(
      balance.getByRole("heading", { name: "Shielded" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Shield" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Unshield" })).toHaveCount(0);
    await expect(page.getByText("No transactions yet")).toBeVisible();

    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByRole("dialog", { name: "Account" })).toContainText(
      "0.01 ZEC",
    );
  });
});

test("receive shows a shielded address, then the transparent one", async ({
  page,
}) => {
  await page.goto("/receive");
  const address = page.getByRole("button", { name: /^u1/ });
  await expect(address).toBeVisible();
  await page.getByRole("radio", { name: "Transparent" }).click();
  const copy = page.getByRole("button", {
    name: account.transparent.slice(0, 8),
  });
  await expect(copy).toBeVisible();
  await expect(
    page.getByRole("img", { name: "QR code of your transparent address" }),
  ).toBeVisible();
});

test("send checks the amount and the recipient", async ({ page }) => {
  await page.goto("/send");
  const amount = page.getByRole("textbox", { name: "Amount in ZEC" });
  const submit = page.getByRole("button", { name: /^Send/ });

  await submit.click();
  await expect(page.getByRole("alert")).toHaveText("Set an amount");

  await amount.fill("1");
  await submit.click();
  await expect(page.getByRole("alert")).toHaveText("Insufficient balance");

  await page.getByRole("radio", { name: "Transparent" }).click();
  await expect(page.getByText("Available: 0.01 ZEC")).toBeVisible();
  await amount.fill("0.001");
  await submit.click();
  await expect(page.getByRole("alert")).toHaveText("Set a recipient");

  await page.getByRole("textbox", { name: "To" }).fill("not-an-address");
  await submit.click();
  await expect(page.getByRole("alert")).toHaveText("Not a valid Zcash address");
});

test("shield builds the transaction and stops at a refused approval", async ({
  page,
}) => {
  await page.goto("/shield");
  await expect(page.getByText("All your transparent funds")).toBeVisible();
  const submit = page.getByRole("button", { name: "Shield 0.01 ZEC" });
  await submit.click();
  await expect(page.getByRole("alert")).toHaveText("Rejected in the keychain");
  expect(
    await page.evaluate(
      () => (globalThis as { signRequests?: string[] }).signRequests?.length,
    ),
  ).toBe(1);
});

test("unshield has nothing shielded to move", async ({ page }) => {
  await page.goto("/unshield");
  await page.getByRole("textbox", { name: "Amount in ZEC" }).fill("0.001");
  await expect(page.getByText("Insufficient balance")).toBeVisible();
});

test("the nav reaches every page", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation").first();
  await nav.getByRole("link", { name: "Transactions" }).click();
  await expect(
    page.getByRole("heading", { name: "Transactions" }),
  ).toBeVisible();
  await expect(page.getByText("No transactions yet")).toBeVisible();
  await nav.getByRole("link", { name: "Receive" }).click();
  await expect(page.getByRole("heading", { name: "Receive" })).toBeVisible();
  await nav.getByRole("link", { name: "Send" }).click();
  await expect(page.getByRole("heading", { name: "Send" })).toBeVisible();
});
