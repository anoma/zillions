# @zillions/test-dapp

A throwaway Vite app for exercising the Zillions Keychain extension's
**approvals (connect)** flow end-to-end.

It polls for the injected `window.zc` provider and lets you:

- **Connect** → triggers the extension's connection-approval popup
- view the **default account** + **all accounts** after approval
- **Sign PCZT** → paste a base64 PCZT, optionally pick a signer, and drive the
  `ApproveSignTx` → `ConfirmSignTx` approval flow; the signed PCZT comes back
  in the output box
- **Disconnect** (revokes the approved origin)

Every provider call is echoed to the on-page debug log.

> The keychain only **signs** a PCZT — it has no PCZT builder — so the Sign box
> expects a base64 PCZT (`pczt.serialize()`) produced elsewhere.

## Run

From the repo root:

```bash
pnpm keychain:dapp
```

Vite serves on a fixed `http://localhost:5173` (`strictPort`). The extension's
content script only injects `window.zc` into `http(s)` pages, so don't open the
built files as `file://`. Stop `pnpm app:dev` first if it holds port 5173.

Then:

1. Load the extension (`pnpm keychain:dev`, or load
   `apps/keychain/.output/chrome-mv3` via `chrome://extensions`).
2. Open <http://localhost:5173>.
3. Click **Connect** and approve in the popup.

> The approved origin is `http://localhost:5173`. The fixed port keeps the
> "already approved" path working across reloads.
