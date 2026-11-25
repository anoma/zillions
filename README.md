# Zillions Interface

Monorepo for the Zillions Zcash wallet:

- [`apps/app`](apps/app/README.md) — the Zillions web app (start here to run it)
- [`apps/keychain`](apps/keychain/README.md) — the Zillions Keychain browser extension
- [`packages/zcore`](packages/zcore/README.md) — Rust/wasm Zcash wallet core: keys, finding notes, building, signing and proving
- [`packages/sapling-params`](packages/sapling-params/README.md) — Sapling proving parameters

What the wallet must do: [docs/product.md](docs/product.md).

## Commands

Everything runs from the repo root. On a fresh checkout, `pnpm bootstrap`
installs every package, creates the apps' `.env` files and builds zcore (see
[Setup](apps/app/README.md#setup) for the tools it needs).

|                           | App                                           | Keychain                                                |
| ------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| Dev server                | `pnpm app:dev`                                | `pnpm keychain:dev` (`keychain:firefox:dev`)            |
| Build                     | `pnpm app:build`                              | `pnpm keychain:build`                                   |
| Test                      | `pnpm app:test` (`app:e2e`)                   | `pnpm keychain:test`                                    |
| Lint / types              | `pnpm app:lint`, `pnpm app:typecheck`         | `pnpm keychain:lint`, `pnpm keychain:typecheck`         |
| Add / remove a dependency | `pnpm app:add <pkg>`, `pnpm app:remove <pkg>` | `pnpm keychain:add <pkg>`, `pnpm keychain:remove <pkg>` |
| Anything else             | `pnpm app <command>`                          | `pnpm keychain <command>`                               |

`pnpm dev` starts both dev servers; `pnpm lint`, `pnpm typecheck` and
`pnpm test` run both packages. Dependencies are pinned exactly (`.npmrc`), and
`-D` adds a dev dependency: `pnpm app:add -D vitest`.

## Security audits

By [Taylor Hornby](https://defuse.ca/) ([@DefuseSec](https://x.com/DefuseSec)):

| Date | Scope |
| --- | --- |
| 2026-11-12 | App, Keychain, zcore |
| 2026-11-06 | Keychain |

## License

Copyright (C) 2026 Heliax

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version. See [LICENSE](LICENSE).
