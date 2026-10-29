# Hardware wallets

Status: built in October 2026 on `tiago/generic-hw-wallet`. Behaviour
doesn't change; the Ledger-only code became a device abstraction so the
next device (Keystone) slots in without touching the IPC contract or the
keyring. What the user sees stays in
[product.md](../product.md) (§3.6); this is how the code is laid out.

## Why

The Ledger code lived wherever it was first needed: the WebHID transport
in `setup/model/`, the progress screen in `setup/ui/`, the
signature-shape knowledge split between the IPC contract and the
keyring. A second device would have grown a second copy of all of it,
and every device difference would leak into the contract, the keyring
and the wizard.

## Decisions

- **A device is an engine plus views** (`src/hardware/types.ts`):
  - **The engine** (`DeviceEngine`) is background-safe: no transports,
    no React. It carries the device's `name`, whether this browser can
    reach it (`isSupported`), how to phrase its errors
    (`describeError`), and `assembleSignedPczt` — how its signing
    output becomes a signed PCZT.
  - **The views** (`DeviceViews`) are the interactive halves, rendered
    by pages only: `Connect` reads the account's keys during setup,
    `Sign` runs the signing session in the approval popup.
  - **The registry** (`index.ts`) maps each `DeviceKind` to its whole
    (`wallets`), for pages; the keyring imports `engines` directly, so
    device transports never reach the service worker.
- **The signing output crosses the IPC boundary opaquely.** The
  `approvals/submitSignTx` request carries `deviceData: string`, and
  only the device's engine knows what's inside:
  `assembleSignedPczt` decodes it, verifies the signatures against the
  unsigned PCZT (zcore refuses a signature that doesn't sign it) and
  folds them in. The concrete `LedgerSignatures` shape lives with the
  zcore façade (`background/crypto/zillions.ts`), which owns the wasm
  binding's parameters; the contract doesn't carry it.
- **Device steps are data.** `DeviceProgress` renders any device
  session's progress (steps, copy, cancel, retry) from a plain step
  list; the Ledger views feed it their copy (`LEDGER_STEPS` in
  `ledger-session.ts`), and the next device brings its own.
- **The wizard's device branch is generic** (`setup/`): the landing
  screen lists every registered device this browser supports, then the
  `device.connect` step renders that device's Connect view,
  `device.name` is the shared name-and-password step with the alias
  prefilled from the device, and `device.complete` is the shared
  completion step. Nothing in the wizard names a device.
- **Storage.** Account records gained an optional `device` field
  (vault schema V2 takes new fields without a migration). The parent of
  a Ledger account keeps the legacy `"ledger"` type; a device that only
  exports a viewing key will parent a `"viewing-key"` account.
  Projections normalize old records written before the field existed
  (`deviceOf` in `background/keyring/types.ts`).

## Layout

- `src/hardware/types.ts` — the abstraction's types.
- `src/hardware/ledger-session.ts` — WebHID + device-session-kit
  transport: discover, connect, app version, read keys, sign.
- `src/hardware/ledger.ts` — the Ledger engine.
- `src/hardware/ledger-views.tsx` — the Ledger screens.
- `src/hardware/device-progress.tsx` — the shared progress screen.
- `src/hardware/engines.ts` / `index.ts` — the registries.

## Adding a device

An entry in `DeviceKind`, an engine, views, a `wallets` entry, and —
only if the device needs data the request doesn't carry yet — an
optional field on `saveDeviceAccount`. The contract's signing channel,
the keyring's `sign` and the wizard don't change.
