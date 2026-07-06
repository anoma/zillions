# Zillions Keychain

A Zcash wallet browser extension (Chrome MV3 / Firefox), built on WXT + React +
Tailwind v4. Part of the `zillions-interface` pnpm workspace; its `@zillions/*`
library code is vendored under `src/packages/`.

## Layout

```
src/                     extension source
  background/            service worker: vault, keyring, crypto, approvals, IPC server
  popup/ setup/ approvals/   the three UI surfaces
  provider/              the injected `window.zc` dapp provider + content-script relay
  ipc/                   typed request/response contract between UI and background
  wallet/                offline address derivation (zillions-sdk façade)
  storage/               vault schemas (io-ts) + storage adapters
  packages/              vendored @zillions/* library code (only the files used):
    components/  types/  utils/  storage/  crypto/
entrypoints/             WXT entrypoints (background, content, injected, popup, setup, approvals)
examples/
  test-dapp/             a minimal dapp to exercise the approvals/connect/sign flows
```

`@zillions/*` imports resolve to `src/packages/*` via path aliases (see
`tsconfig.json` and `wxt.config.ts`); they are internal vendored modules, not
external dependencies. The exception is `@zillions/keychain-types`
(`src/packages/types`), which is a workspace package shared with the app.

## Scripts

Run from this directory (or with `pnpm --filter zillions-keychain` from the root):

- `pnpm dev` — WXT dev server (Chrome); `pnpm dev:firefox` for Firefox
- `pnpm build` — Chrome MV3 + Firefox builds (`.output/<browser>-mv3`)
- `pnpm build:chrome` — Chrome only
- `pnpm compile` — `tsc --noEmit`
- `pnpm lint` — ESLint over `src` + `entrypoints`

## WASM

Two WebAssembly modules run in the extension:

- `src/packages/crypto` — AES/Argon2/mnemonic primitives (background only).
- `@zillions-sdk/keys` — Zcash key/address derivation and PCZT signing,
  consumed as a pnpm workspace dependency from `sdk/`.

MV3 requires `'wasm-unsafe-eval'` in the extension CSP for these to instantiate;
that is set in `wxt.config.ts`.

## Example dapp

`examples/test-dapp` is a standalone Vite app that talks to the extension via
`window.zc` (connect, accounts, sign PCZT, sign arbitrary message, verify,
update default account) and logs the wallet events the extension broadcasts.

```bash
cd examples/test-dapp
npm install
npm run dev   # http://localhost:5173
```
