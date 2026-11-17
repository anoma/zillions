# Hardware wallets

Status: built in October 2026 on `tiago/generic-hw-wallet` (the
abstraction), `tiago/keystone-support` (the second device) and
`tiago/passkey-support` (the third). Behaviour doesn't change; the
Ledger-only code became a device abstraction so the next device slots in
without touching the IPC contract or the keyring.
What the user sees stays in [product.md](../product.md) (§3.6–§3.8); this
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
  screen's hardware card opens a picker of the registered devices this
  browser supports (the passkey is a top-level card with its own flow —
  same steps, no picker; its Connect view offers create-or-import in the
  picker's place); the `device.connect` step renders that
  device's Connect view, `device.name` is the shared name-and-password
  step with the alias prefilled from the device, and `device.complete`
  is the shared completion step. The step components don't name a
  device — the views and the per-flow header metadata do.
- **Storage.** Account records gained an optional `device` field
  (vault schema V2 takes new fields without a migration). The parent of
  a Ledger account keeps the legacy `"ledger"` type; a device that only
  exports a viewing key parents a `"viewing-key"` account (the
  Keystone's). Projections normalize old records written before the
  field existed (`deviceOf` in `background/keyring/types.ts`).

### The Keystone module

The second device proves the abstraction: no contract change, no keyring
change, no wizard change — just a kind, an engine, views.

- **Cypherpunk firmware only.** The Zcash app ships only in Keystone's
  Cypherpunk firmware: the `zcash-accounts` sync our Connect view scans and
  the stamped, redacted `zcash-pczt` responses are generated from the
  firmware's `cypherpunk_wallet/zcash.rs`, and the 2.x/3.x version line the
  firmware gate reads is the Cypherpunk line. The multi-coin and BTC-only
  editions expose neither, so a device running them never answers — there
  is nothing to detect, only to explain, which the engine's name
  ("Keystone (Cypherpunk)") and the Connect screen's copy do.
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
  global's proprietary map. `assembleSignedPczt` refuses anything without
  a readable stamp of at least 3.0.8 — the first Cypherpunk release that
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

### The Passkey modules

The third device needs no zcore work (`deriveAccount`, `signPczt` and the
rest already exist) and no wasm rebuild — it rides the second device's
abstraction. What's different is where its keys live: nowhere. There is
one kind, `passkey-prf` — the account's seed re-derives from the
credential's PRF output at every ceremony — sharing one pure core
(`passkey-core.ts`) and one set of view parts. A passkey that can't
evaluate a PRF cannot open an account: connect fails with an explicit
error and the user picks another import mechanism. There is no fallback
kind, and a dismissed dialog is a cancel, never a custody switch. The
connect screen offers both directions — create a credential here, or
import one the browser already holds (a synced passkey re-derives the
same account anywhere).

- **One custody model, no secret at rest.** A `passkey-prf` account
  carries no secret anywhere — not even inside the vault — only public
  material: the UFVK, the addresses, the ZIP-32 seed fingerprint, and the
  credential (`id`, `rpId`, plus its COSE public key when created here —
  an imported credential's record holds the id and RP alone) in the
  record's `credential` field.
- **The seed re-derives at every ceremony, and nothing lingers.** The
  passkey evaluates its PRF for the fixed salt `zillions/zcash-seed/v1`,
  and the PRF output is the entropy of a BIP-39 24-word phrase that
  never exists as text: `passkey-seed.ts` packs the entropy straight to
  the phrase's ASCII bytes (the encoding is deterministic bit-packing,
  not crypto) and WebCrypto's PBKDF2-HMAC-SHA-512 with the fixed
  `"mnemonic"` salt does the rest. The same salt and the same path
  reproduce the seed on every machine; the passkey is the backup. Every
  derivation runs inside `withPrfSeed`, which zero-fills the PRF output
  and the seed on every exit, throws included — the page-side
  ceremonies zero the PRF buffer once encoded, and the wasm's seed
  copies die zero-filled with each call (`Zeroizing` at zcore's
  boundary). Two residuals, both inside the extension: the PRF output
  rides to the engine as base64 inside the `deviceData` string
  (unzeroizable, GC-bound), and WebCrypto's `importKey` holds a
  non-extractable copy of the phrase bytes until GC. The wasm
  `MnemonicService` path stays the seed authority for the phrase
  wallets; the passkey runtime no longer touches it. The seed pin tests
  (`passkey-seed.test.ts`) tie the new path to the official BIP-39
  vectors, the `@scure` string path, and a fixed seed.
- **The consensus constants live alone (`passkey-constants.ts`).** The
  RP ID `keychain.zillions.money` and the PRF salt are a zero-import
  module the build (`wxt.config.ts`) and the ceremonies
  (`passkey-core.ts`) both import, so the manifest cannot drift from
  what the ceremonies claim. Nothing is ever served from the
  RP host — no DNS record, no catch-all — so no web page can claim it:
  an RP ID must be a registrable-domain suffix of the caller's origin,
  and a child of `zillions.money` is never a suffix of it. The salt is
  fixed and domain-separated; either constant is a migration, not a fix
  (the pin tests in `passkey-constants.test.ts` fail on a silent edit).
- **Connect asks for the PRF at create, probes on fallthrough.** The
  create ceremony requests the PRF extension with the salt evaluated
  inline — one ceremony, one dialog, on synced providers that evaluate
  at create — and its response is verified locally
  (`verifyRegistrationResponse`); `prfFromRegistration` reads the
  output out of it, `enabled === false` failing fast. No output → the
  probe: a get() ceremony on the still-unstored credential evaluating
  the same salt, with both PRF request forms sent (`eval` and
  `evalByCredential` — some providers process only one). A missing
  output — or a ceremony refusing the extension outright
  (`NotSupportedError`) — is the explicit no-PRF outcome
  (`isPrfMissing` in the prf views' catch); a user cancellation
  (`NotAllowedError`) is just a cancel. The probe's assertion is
  verified like any later spend's. The connect screen pre-flights the
  browser's PRF capability (`browserPrfSupport`) and shows the same
  error before any dialog when it's known absent.
- **Import recovers the account; it cannot recover the verifying key.**
  The second path runs a discovery get() — no `allowCredentials`, so the
  browser's picker lists every synced passkey for the RP and the user
  picks the one whose account to re-establish (the `eval` PRF form only:
  `evalByCredential` names credential ids, which discovery can't know).
  An authentication response never carries the credential's public key —
  only a create response does — so an imported account's record holds
  the credential's id and RP alone. Its spends are gated by the
  extension's own review screen and the OS verification dialog instead
  of a verified assertion: strictly weaker than a created account, since
  the PRF output is constant per credential and replayable by a
  compromised page that once saw one. Documented rather than papered
  over — no WebAuthn API re-reads an existing credential's key, so the
  gap has no in-protocol close (it's why every PRF deployment keeps an
  RP-side record or recovery code). The import refuses a passkey whose
  account is already stored (same seed → same addresses, found before
  naming); a dismissed or empty picker is one `NotAllowedError`, and the
  chooser's copy reads true for both. This is what makes "the passkey is
  the backup" exercisable: a fresh install recovers the account from the
  synced passkey alone.
- **The credential request stays browser-generous.** `residentKey` is
  `"preferred"` (discoverability is never used — every ceremony names
  its credential in `allowCredentials`), and `pubKeyCredParams` offers
  ES256 and RS256, with Ed25519 added only when the browser's WebCrypto
  can verify it (`canVerifyEd25519`, cached feature detect) — so
  CTAP2.0-era security keys and Ed25519-only ones can register.
- **Nothing reveals the seed, ever.** Both reveal paths refuse device
  accounts: `revealMnemonic` by its type check, `revealSpendingKey` by
  walking to the secret holder and refusing every device kind.
- **The contract change is one optional parameter.** The verifying
  public key must come from the STORED credential — trusting a key the
  page handed over would let any page have its assertions checked
  against keys it chose. So `assembleSignedPczt` takes an optional
  `context` (`DeviceSignContext`: the credential at rest and the
  account's ZIP-32 index), which the keyring fills from its records;
  Ledger and Keystone verify against the transaction alone and keep
  their two-parameter engines.
- **The verification is one library call** (`@simplewebauthn/server`,
  v14, WebCrypto-only — it imports cleanly in the service worker): the
  assertion is checked against the stored key; the expected challenge is
  SHA-256 of the unsigned PCZT's bytes (the view hashed the same
  transaction); the expected origin is both extension-origin forms,
  computed at runtime (Chrome's `chrome-extension://<id>`; Firefox's
  SHA-256-of-the-id encoding, two base-16 characters per byte, a–p); the
  expected RP is `keychain.zillions.money`; user verification is required.
  An imported account's record carries no key, so its assertions go
  unverified (see the import bullet above) — created accounts get the
  full check.
  Attestation chains and signature counters are skipped: synced passkeys
  don't advance counters, and authenticator models aren't the threat
  model.
- **The transport is the browser's own passkey dialog.** The extension
  claims the `keychain.zillions.money` RP through the manifest's host
  permissions — derived from `RP_ID` in `wxt.config.ts`, so the manifest
  cannot drift from what the ceremonies claim; the CI manifest guard
  knows the one extra host and nothing else (Chrome 122+, Firefox
  150+) — so every ceremony runs in an extension page, every assertion's
  origin is the extension's own, and no site can mint one. Nothing
  travels by wire; the error/retry posture is the Keystone's: the views
  render `describeError` and re-arm.
- **Spend gates, not verifies, at the page.** The Sign view binds the
  ceremony to `credentialId` from the background (`allowCredentials` and
  the PRF evaluation key on it), and the challenge is SHA-256 of the
  unsigned PCZT; the engine re-checks everything after the page. The
  PRF output rides the same response as the assertion, so the page
  can't assemble a seed from one ceremony and a signature from another.
- **Safari is unspiked**: extension-page WebAuthn there is unknown
  territory, so the module gates on WebAuthn presence like the others
  and older browsers fail loudly at the ceremony with copy in
  `describeError`.

### The Trezor module

The fourth device needs no contract change and no wizard change — a kind,
an engine, views, and the zcore work a transparent-only device owes the
PCZT. What's different is where its keys stop: a Trezor holds no shielded
keys at all, so its account is transparent-only end to end.

- **The transport is connect-core over WebUSB, and the Keychain answers
  everything.** `@trezor/connect-core` (pinned, like the Ledger kits)
  drives the device through `@trezor/transport-web`; no Suite, no popup
  handoff, no trezor.io page. Connect's UI requests are answered in the
  session: the PIN goes to the Connect/Sign view's pad — digits picked by
  the positions the device's screen shows, since the pad's layout is
  scrambled on purpose — a passphrase stays on the device and empty (the
  account model is the device's plain one), connect's own confirmations
  pass, and THP pairing takes the first method the device offers while
  the code check happens on the device's screen. The browser's own
  `requestDevice` picker (a user gesture) grants the device; WebUSB
  reaches only granted devices afterwards, so a re-connect re-arms the
  gesture through the retry button. Chromium-based browsers only.
- **The account is the device's xpub, encoded by zcore.** Setup reads the
  account's xpub at `m/44'/coin'/0'` off the device (connect's
  `getPublicKey`, coin `zec`/`taz` by network, shown for approval), and
  `ufvk_from_transparent_xpub` encodes it as a Revision 2 UFVK holding
  only its P2PKH item (`uvf1…`). The keyring derives the addresses from
  the viewing key — generalized from what the Keystone's Connect view did
  page-side, and what lets a transparent-only key name no shielded
  address at all: its unified address is the transparent-only one
  (`tu1…`). The alias is the model the device reports.
- **The mapper is Rust, not JavaScript.** `pczt_trezor_transaction`
  (zcore `src/trezor.rs`) turns a transparent-only PCZT into connect's
  Bitcoin-style SignTx: prevouts as display txids at the coins' own
  BIP-44 paths, P2PKH scripts checked against the keys they name, change
  addressed by path, the rest by address, amounts plain numbers (zatoshi
  sits far below the safe range). Shielded pools, non-SIGHASH-ALL coins
  and non-V5 transactions are refused before the device hears about any
  of it. The plan pins V5 for transparent-only plans of accounts with no
  shielded keys — V5 needs no referenced transactions streamed back, so
  the SignTx is all the firmware reads. Its tests round-trip through the
  Ledger signer kit's apply, which is what folds the signatures back in:
  connect returns DER ‖ sighash-byte hex indexed by input, the same shape
  the Ledger engine already carries, with the shielded lists empty.
- **The device never reveals its seed's fingerprint.** The PCZT's
  derivation carries one; zeros, as for a Ledger — the device doesn't
  check it.
- **Errors stay in connect's words until the engine speaks them.**
  Connect's TypedErrors (`Device_NotFound`, `Method_Cancel`, …) come
  through `describeError`, which names the two-granted-devices case the
  picker can't resolve and reads a cancel as a cancel.

## Layout

- `src/hardware/types.ts` — the abstraction's types.
- `src/hardware/ledger-session.ts` — WebHID + device-session-kit
  transport: discover, connect, app version, read keys, sign.
- `src/hardware/ledger.ts` — the Ledger engine.
- `src/hardware/ledger-views.tsx` — the Ledger screens.
- `src/hardware/keystone.ts` — the Keystone engine.
- `src/hardware/keystone-views.tsx` — the Keystone screens.
- `src/hardware/passkey-constants.ts` — the consensus constants (RP ID,
  PRF salt), a zero-import leaf the build, the runtime and the CI guard
  share (pin-tested).
- `src/hardware/passkey-core.ts` — the ceremonies' shared pure frame (RP,
  salt, challenge binding, origin checks, entropy → seed).
- `src/hardware/passkey-view-parts.tsx` — the shared view parts
  (create, probe and import ceremonies, sign screen).
- `src/hardware/passkey-prf.ts` — the `passkey-prf` engine.
- `src/hardware/passkey-prf-views.tsx` — the `passkey-prf` screens.
- `src/hardware/trezor-session.ts` — connect-core + WebUSB transport:
  init, UI answers, read the xpub, sign.
- `src/hardware/trezor.ts` — the Trezor engine.
- `src/hardware/trezor-views.tsx` — the Trezor screens (PIN pad).
- `src/hardware/device-progress.tsx` — the shared progress screen.
- `src/hardware/engines.ts` / `index.ts` — the registries.

## Adding a device

An entry in `DeviceKind`, an engine, views, a `wallets` entry, and —
only if the device needs data the request doesn't carry yet — an
optional field on `saveDeviceAccount`. The wizard doesn't change. The
keyring takes a change only when the account model moves: the Trezor's
was the first (addresses derive from the viewing key when a device
doesn't hand them over). What a device that signs differently owes is
its own zcore work — the Trezor's PCZT→SignTx mapper and its
transparent-only UFVK encoding live in Rust, tested there, behind the
same façade the other devices' bindings use. The passkey also gave
`assembleSignedPczt` an optional third parameter: the keyring passes
the device's at-rest state (its credential and ZIP-32 index — the
engine never trusts it from the page) — where Ledger, Keystone and
Trezor verify against the transaction alone and need none of it.
