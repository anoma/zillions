# Zillions Interface

Monorepo for the Zillions Zcash wallet:

- [`apps/app`](apps/app/README.md) — the Zillions web app (start here to run it)
- [`apps/keychain`](apps/keychain/README.md) — the Zillions Keychain browser extension
- [`packages/zcore`](packages/zcore/README.md) — Rust/wasm Zcash wallet core: keys, finding notes, building, signing and proving
- [`packages/sapling-params`](packages/sapling-params/README.md) — Sapling proving parameters

What the wallet must do: [docs/product.md](docs/product.md).

## Security audits

By [Taylor Hornby](https://defuse.ca/) ([@DefuseSec](https://x.com/DefuseSec)):

| Date | Scope |
| --- | --- |
| 2026-11-12 | App, Keychain, zcore |
| 2026-11-06 | Keychain |
