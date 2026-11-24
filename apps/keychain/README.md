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
  hardware/              Ledger, Keystone and passkey signers
  storage/               vault schemas (io-ts) + storage adapters
  packages/              vendored @zillions/* library code (only the files used):
    components/  types/  utils/  storage/
  utils/                 small shared helpers (ids, origins)
entrypoints/             WXT entrypoints (background, content, injected, popup, setup, approvals)
examples/
  test-dapp/             a minimal dapp to exercise the approvals/connect/sign flows
```

`@zillions/*` imports resolve to `src/packages/*` via path aliases (see
`tsconfig.json` and `wxt.config.ts`); they are internal vendored modules, not
external dependencies. The exception is `@zillions/keychain-types`
(`src/packages/types`), which is a workspace package shared with the app.

## Scripts

From the repo root:

- `pnpm keychain:dev` — WXT dev server (Chrome); `pnpm keychain:firefox:dev` for Firefox
- `pnpm keychain:build` — Chrome MV3 + Firefox builds (`.output/<browser>-mv3`)
- `pnpm keychain chrome:build` — Chrome only
- `pnpm keychain:zip` — store packages in `.output/`: `*-chrome.zip` (Chrome Web
  Store), `*-firefox.zip` and `*-sources.zip` (Firefox Add-ons)
- `pnpm keychain:typecheck` — `tsc --noEmit`
- `pnpm keychain:lint` — ESLint over `src` + `entrypoints`
- `pnpm keychain:test` — Vitest
- `pnpm keychain:add <pkg>` / `pnpm keychain:remove <pkg>` — manage dependencies
- `pnpm keychain:dapp` — the [example dapp](#example-dapp)

`pnpm keychain <command>` runs any other script or pnpm command in this
package, e.g. `pnpm keychain exec wxt prepare`.

## Building from the sources zip

For Firefox Add-ons reviewers. Requires Node 24 and pnpm 10.34.9 (Corepack:
`corepack enable`). From the root of the unzipped sources:

```bash
pnpm install --frozen-lockfile
pnpm --filter zillions-keychain exec wxt build -b firefox
```

The extension is written to `apps/keychain/.output/firefox-mv3`. No
environment variables are needed.

The WebAssembly ships prebuilt: `packages/zcore/pkg` is CI's build of
`packages/zcore` (`.github/workflows/build-wasm.yml`); `packages/zcore/build.sh`
rebuilds it with the same pinned tools.

## WASM

`@zillions/zcore`, the workspace package `packages/zcore`, is the only
WebAssembly in the extension: Zcash keys, addresses, finding notes, building,
signing and proving, and the vault's Argon2id. The rest of the vault's crypto is
WebCrypto (AES-256-GCM) and `@scure/bip39` (seed phrases).

MV3 requires `'wasm-unsafe-eval'` in the extension CSP for it to instantiate;
that is set in `wxt.config.ts`.

## Example dapp

`examples/test-dapp` is a standalone Vite app that talks to the extension via
`window.zc` (connect, accounts, sign PCZT, sign arbitrary message, verify,
update default account) and logs the wallet events the extension broadcasts.

```bash
pnpm keychain:dapp   # http://localhost:5173
```
