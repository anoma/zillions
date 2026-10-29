# Hardware wallets

Status: built in October 2026 on `tiago/generic-hw-wallet` (the
abstraction) and `tiago/keystone-support` (the second device). Behaviour
doesn't change; the Ledger-only code became a device abstraction so the
next device slots in without touching the IPC contract or the keyring.
What the user sees stays in [product.md](../product.md) (§3.6, §3.7); this
is how the code is laid out.

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
  exports a viewing key parents a `"viewing-key"` account (the
  Keystone's). Projections normalize old records written before the
  field existed (`deviceOf` in `background/keyring/types.ts`).

### The Keystone module

The second device proves the abstraction: no contract change, no keyring
change, no wizard change — just a kind, an engine, views.

- **QR is the transport.** The device has no browser transport to drive:
  `AnimatedQRCode`/`AnimatedQRScanner` (`@keystonehq/animated-qr`) turn
  the PCZT into an animated UR (`zcash-pczt`, from
  `@keystonehq/bc-ur-registry-zcash` — no Keystone SDK needed, its
  `RegistryItem.toUR()` is enough) for the device's camera, and scan the
  device's animated response back. The Sign view shows both at once:
  the request's code above, the camera below. Camera access is the whole
  posture — Firefox and Safari work, unlike the Ledger's WebHID.
- **The response combines, it doesn't replace.** A Keystone signs and
  strips the proof keys it holds no use for, so its PCZT alone can't
  prove. `assembleSignedPczt` (`keystone.ts`) merges the response into
  the keychain's full copy with the pczt crate's `Combiner`
  (zcore's `combine_pczts`), which compares every global, input and
  output field pairwise and refuses conflicting values — a response for
  any other transaction is refused, and the signatures are checked
  against the combined transaction when the app extracts it.
- **The device proves its firmware.** Signed responses stamp
  `keystone:fw_version` (three raw bytes, major/minor/build) into the
  global's proprietary map. `assembleSignedPczt` refuses anything
  without a readable stamp of at least 3.0.8 — the first release that
  stamps at all (and signs Ironwood), so a stamp-less response is
  indistinguishable from an unsupported one. The stamp reader is
  `pczt_keystone_fw_version` in zcore; the device displays major minus
  10, so raw `13.0.8` is what the user sees as "3.0.8".
- **Connect derives what the device doesn't show.** A Keystone exports
  keys only (a `zcash-accounts` UR: seed fingerprint, accounts with
  name, index, UFVK): its Connect view derives the addresses from the
  UFVK (`deriveAccountFromUfvk` in the zcore façade) before handing
  over `DeviceKeys` — the same turn every account's keys go through.
  The keyring's only knowledge is generic: an account identifies by its
  transparent address, or the unified one when its keys name no
  transparent receiver.
- **Errors and retries stay in view.** Unlike the Ledger's step
  machine, the camera keeps running; the views render the scanner's
  errors through the engine's `describeError` and re-mount it to
  re-ask for the camera.

## Layout

- `src/hardware/types.ts` — the abstraction's types.
- `src/hardware/ledger-session.ts` — WebHID + device-session-kit
  transport: discover, connect, app version, read keys, sign.
- `src/hardware/ledger.ts` — the Ledger engine.
- `src/hardware/ledger-views.tsx` — the Ledger screens.
- `src/hardware/keystone.ts` — the Keystone engine.
- `src/hardware/keystone-views.tsx` — the Keystone screens.
- `src/hardware/device-progress.tsx` — the shared progress screen.
- `src/hardware/engines.ts` / `index.ts` — the registries.

## Adding a device

An entry in `DeviceKind`, an engine, views, a `wallets` entry, and —
only if the device needs data the request doesn't carry yet — an
optional field on `saveDeviceAccount`. The contract's signing channel,
the keyring's `sign` and the wizard don't change.
