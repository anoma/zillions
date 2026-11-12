# Zillions App

The Zillions Zcash wallet web app. What it does: [docs/product.md](../../docs/product.md).

## Stack

- React + TypeScript + Vite
- Tailwind
- TanStack Router and Query
- Dexie (IndexedDB)
- [`@zillions/zcore`](../../packages/zcore) (Rust/wasm, built locally: see Setup)

## Setup

You'll need `node` (18.18+), `pnpm`, and what zcore's build needs:
[rustup](https://rustup.rs) and a clang that targets wasm32 (on macOS,
`brew install llvm`). From the repo root:

```bash
pnpm install
pnpm zcore:build
cp apps/app/.env.example apps/app/.env
```

Run `pnpm zcore:build` again after pulling zcore changes.

`.env.example` targets mainnet. For testnet, set `VITE_ZCASH_NETWORK=test`
and point `VITE_GRPC_URL` and `VITE_INDEXER_URL` at testnet servers.

The app signs through the Zillions Keychain extension. Download it from
https://zillions-app.netlify.app/zillions-keychain.zip, unzip it into a
folder, and load that folder in `chrome://extensions` (Developer mode → Load unpacked).
Or build it from source: see the [Keychain README](../keychain/README.md).

## Develop

```bash
pnpm app:dev
```

Opens on http://localhost:5173.

## Test

```bash
pnpm app:test
```

## Build

```bash
pnpm app:build
```

## Sync

The shielded sync reads each pool's chunks newest-first in four phases.
Details and measurements: [docs/design/sync-phases.md](../../docs/design/sync-phases.md).

```mermaid
%%{init: {"flowchart": {"wrappingWidth": 600}}}%%
flowchart TB
    subgraph sync["<b>Shielded Sync</b>"]
        direction TB

        subgraph phases[" "]
            direction LR

            subgraph catchup["<b>1. Catch-up</b>"]
                direction TB
                c1["Tip → last visit<br/><b>≈2 MB/day away</b>"] ~~~ c2["Runs on every visit,<br/>empty on the first"]:::when ~~~ c0(["All cores (full power)"]):::cores ~~~ cpad1[" "]:::ghost ~~~ cpad2[" "]:::ghost ~~~ cpad3[" "]:::ghost
            end

            subgraph setup["<b>2. Setup</b>"]
                direction TB
                s1["First visit → <code>~1 year back</code><br/><b>≈310 MB</b>"] ~~~ s2["Runs until done,<br/>once per account"]:::when ~~~ s0(["All cores (full power)"]):::cores ~~~ spad1[" "]:::ghost ~~~ spad2[" "]:::ghost ~~~ spad3[" "]:::ghost
            end

            subgraph history["<b>3. History</b>"]
                direction TB
                h1["① <code>~1 year back</code> → 2.1M<br/><b>≈560 MB</b>"] --> h2["② 1.71M → 0<br/><b>≈185 MB</b>"] ~~~ h4["Runs until done,<br/>once per account"]:::when ~~~ h0(["2 cores (background)"]):::cores ~~~ hpad1[" "]:::ghost ~~~ hpad2[" "]:::ghost
            end

            subgraph spam["<b>4. Spam era</b>"]
                direction TB
                p1["2022–23: 2.1M → 1.71M<br/><b>≈15 GB</b>"] ~~~ p2["Starts and pauses on the<br/>user's tap, per account"]:::when ~~~ p0(["2 cores (background)"]):::cores ~~~ ppad1[" "]:::ghost ~~~ ppad2[" "]:::ghost ~~~ ppad3[" "]:::ghost
            end

            catchup --> setup --> history --> spam
        end

        subgraph rules[" "]
            direction TB
            resume["Every phase continues where it stopped"]:::when ~~~ birthday["If the account has a birthday, the sync stops there, in any phase"]:::when ~~~ hidden(["Hidden tab → 1 core, in any phase"]):::cores
        end

        phases ~~~ rules
    end

    classDef cores fill:#fff4d6,stroke:#c9a227,stroke-width:1px,stroke-dasharray:4 3,color:#5a4500
    classDef when fill:#eef3f8,stroke:#7a8ca3,stroke-width:1px,stroke-dasharray:2 2,color:#2f3e52,font-style:italic
    classDef ghost fill:none,stroke:none
    style phases fill:none,stroke:none
    style rules fill:none,stroke:none
```

- **~1 year back** is fixed at build time: `vite.config.ts` asks the indexer
  for each pool's chunk a year before its tip (`SETUP_CHUNKS`), so the build
  needs the indexer reachable. An account keeps the value from its first sync.
- **Spam era**: once history is done, the sync indicator explains why the
  spam era waits and offers "Sync spam era"; the user can pause and resume
  it. The choice is stored with the account (`spamSync`), so it resumes on
  later visits. Funds received in 2022–23 only show once it's read.
- **Speed up**: while history or the spam era runs, the sync indicator offers
  "Speed up", which moves it to every core until "Slow down" or a reload. A
  hidden tab still drops to 1 core.
- **Save data**: when the browser asks to save data
  (`navigator.connection.saveData`, Chromium only), history waits until the
  user taps "Download older history". The spam era needs the user's tap
  anyway.
- **Re-sync**: a minute after each sync ends, the wallet syncs again for new
  activity, unless history or the spam era is running (a sync would pause
  it); then it waits until they end. Catch-up skips pools with nothing new.
- **`VITE_ALLOW_CPU_TO_FRY=true`** runs every phase on every core, hidden tab
  or not. Handy for testing a full sync quickly.
- **Birthday**: a created account gets one from the device clock; an imported
  one has none, so its history runs back to each pool's start.
- Download sizes are worst case, measured on mainnet in October 2026: full
  chunks never change, so the browser's HTTP cache can make re-reads free.
