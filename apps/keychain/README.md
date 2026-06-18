# Zillions Keychain

A Zcash wallet browser extension (Chrome MV3 / Firefox), built on WXT + React +
Tailwind v4. Standalone — no monorepo: the shared library code it uses is
vendored under `src/packages/`.

## Layout

```
src/                     extension source
  background/            service worker: vault, keyring, crypto, approvals, IPC server
  popup/ setup/ approvals/   the three UI surfaces
  provider/              the injected `window.zc` dapp provider + content-script relay
  ipc/                   typed request/response contract between UI and background
  wallet/                offline address derivation (webzjs façade)
  storage/               vault schemas (io-ts) + storage adapters
  packages/              vendored @zillions/* library code (only the files used):
    components/  types/  utils/  storage/  crypto/  webzjs-keys/
entrypoints/             WXT entrypoints (background, content, injected, popup, setup, approvals)
examples/
  test-dapp/             a minimal dapp to exercise the approvals/connect/sign flows
scripts/                 build-webzjs-keys.sh (rebuilds the webzjs-keys WASM from source)
```

`@zillions/*` imports resolve to `src/packages/*` via path aliases (see
`tsconfig.json` and `wxt.config.ts`); they are internal vendored modules, not
external dependencies.

## Scripts

- `npm run dev` — WXT dev server (Chrome); `npm run dev:firefox` for Firefox
- `npm run build` — Chrome MV3 + Firefox builds (`.output/<browser>-mv3`)
- `npm run build:chrome` — Chrome only
- `npm run compile` — `tsc --noEmit`
- `npm run lint` — ESLint over `src` + `entrypoints`
- `npm run build:webzjs` — rebuild the `@zillions/webzjs-keys` WASM from the
  WebZjs Rust source (requires the Rust/wasm toolchain; the prebuilt artifacts
  are vendored, so this is only needed to change the bindings)

## WASM

Two WebAssembly modules run in the extension:

- `src/packages/crypto` — AES/Argon2/mnemonic primitives (background only).
- `src/packages/webzjs-keys` — Zcash key/address derivation and PCZT signing,
  with vendored bindings added on top of WebZjs (see `scripts/webzjs-patch/`).

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
