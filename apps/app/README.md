# Zillions App

The Zillions Zcash wallet web app. What it does: [docs/product.md](../../docs/product.md).

## Stack

- React + TypeScript + Vite
- Tailwind
- TanStack Router and Query
- Dexie (IndexedDB)
- [`@zillions/zcore`](../../packages/zcore) (Rust/wasm; prebuilt and committed, no Rust needed)

## Setup

You'll need `node` (18.18+) and `pnpm`. From the repo root:

```bash
pnpm install
cp apps/app/.env.example apps/app/.env
```

`.env.example` targets mainnet. For testnet, set `VITE_ZCASH_NETWORK=test`
and point `VITE_GRPC_URL` and `VITE_INDEXER_URL` at testnet servers.

The app signs through the Zillions Keychain extension. Download it from
https://main--zillions-app.netlify.app/zillions-keychain.zip, unzip it into a
folder, and load that folder in `chrome://extensions` (Developer mode → Load unpacked).
Or build it from source: see the [Keychain README](../keychain/README.md).

## Develop

```bash
pnpm app:dev
```

Opens on http://localhost:5173.

## Build

```bash
pnpm app:build
```
