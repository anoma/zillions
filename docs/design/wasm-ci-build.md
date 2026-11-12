# zcore wasm built in GitHub Actions

Status: built in PR #229, 2026-11-12.

## Problem

`packages/zcore/pkg/zcore_bg.wasm` (6 MB) ships in the app and the keychain.
It is built on a developer's laptop and committed. Nobody can review a binary
diff, so whoever commits `pkg/` decides what runs, whatever the Rust source
says. It also drifts: #228 changed `roles.rs` without rebuilding `pkg/`, and
the committed wasm carried its builder's home directory in 235 panic strings.

The keychain's other wasm, `crypto_bg.wasm`, has no source in the repo at all.
It is out of scope here: [#226](https://github.com/anoma/zillions-frontend/issues/226).

## Decided

- **`pkg/` is not committed.** Every developer builds zcore with `build.sh`
  (rustup + a clang that targets wasm32), as Rust developers do today.
- **Only CI's build ships.** Netlify and the keychain release download the
  artifact CI built for the exact zcore source; nothing ships a local build.
- **Netlify keeps building the site** (deploy previews, branch deploys,
  production from `production`); it only fetches the wasm instead of building it.
- **zcore only.** `crypto_bg.wasm` waits for #226.
- **`/zillions-keychain.zip` is dropped.** Nothing links to it; the keychain
  ships only from GitHub releases.

## How a commit finds its wasm

`source-hash.mjs` hashes everything `build.sh` turns into `pkg/`. CI names its
build `zcore-pkg-<hash>`. Any commit with the same zcore source has the same
hash, so a JS-only commit reuses the artifact of the last commit that changed
zcore, with no run of its own.

## Plan

All of it is in PR #229.

### 1. Pinned build

`rust-toolchain.toml` pins Rust; `packages/zcore/build.sh` pins the
`wasm-bindgen` CLI and binaryen, installs them into `.tools/`, remaps machine
paths (home, checkout, the standard library's source) out of the wasm, and
writes `pkg/.source-hash`. `smoke.mjs` loads the result and derives an account.

### 2. When CI builds

`build-wasm.yml` runs on:

- **push to any branch, only when zcore changes** (`paths:` on
  `packages/zcore/**` and the workflow). A JS-only push runs nothing.
- **`workflow_call`** from `ci.yml`, whose check, keychain and e2e jobs test
  CI's build. With the cache keyed on the source hash, a JS-only PR restores
  `main`'s build in ~15 s instead of compiling.

Artifacts from `main` and `production` are kept 400 days, everything else 14.
GitHub can't extend an artifact's expiry after upload, so a long retention is
what keeps `main`'s build available while zcore doesn't change. It is capped by
the repository's artifact retention setting (90 days by default; raise it to
400 in Settings → Actions → General).

Ponytail: a zcore change on a PR branch builds twice, once for the push (the
commit Netlify previews) and once in `ci.yml` (the PR merged into `main`).
Fine while zcore changes are occasional.

### 3. Netlify fetches the wasm

Netlify's build command, `pnpm run build`, runs `scripts/build.sh`: on Netlify
(`NETLIFY=true`) it runs `scripts/fetch-zcore.mjs`, then builds the app. The
keychain build and `/zillions-keychain.zip` are gone.

`fetch-zcore.mjs`:

1. Hashes zcore's source in the checkout.
2. Looks up the newest unexpired artifact `zcore-pkg-<hash>` in this repo.
   - **Production** (`CONTEXT=production`): only from push runs on `main` or
     `production`. A branch can run any workflow code, so without this a
     branch could upload a tampered build under `main`'s hash and production
     would pick it up unreviewed.
   - **Previews and branch deploys**: from any run in this repo.
3. If there is none yet, polls every 20 s while `build-wasm.yml` runs for
   `COMMIT_REF`; fails with a clear message if no run shows up within two
   minutes or the build takes over 20.
4. Downloads it, checks the zip against the artifact's SHA-256 digest and
   `pkg/.source-hash` against the hash, swaps it into `packages/zcore/pkg`, and
   logs the run it came from.

Netlify needs `ZCORE_GITHUB_TOKEN`: a fine-grained token for this repo with
Actions: read only. Netlify withholds secrets from fork PR previews, so those
fail until approved.

Timing: when zcore didn't change, a few seconds. When it did, Netlify waits
for CI (~3 min with warm Rust caches, ~5½ cold), which counts against Netlify
build minutes. `production` is a commit already on `main`, so it never waits.

### 4. Keychain release

`release-please.yml`'s `keychain-zip` job runs `fetch-zcore.mjs` with
`CONTEXT=production` before `pnpm keychain:zip`, so the zip on the GitHub
release, the one the stores get, carries `main`'s CI build.

### 5. `pkg/` not committed

`pkg/` is gitignored. Developers run `pnpm zcore:build` once and after zcore
changes (rustup + a clang that targets wasm32).

## Before merging

- Netlify: add `ZCORE_GITHUB_TOKEN`.
- GitHub: raise artifact retention to 400 days.

## Measured

|                                    | Time                                           |
| ---------------------------------- | ---------------------------------------------- |
| CI wasm build, cold                | 5m30s                                          |
| CI wasm build, warm Rust caches    | 2m55s                                          |
| CI wasm job, cached build          | 15s                                            |
| Draft deploy to Netlify via API    | 22s                                            |
| Mac vs CI build of the same source | not byte-identical (clang 23 vs 18, std paths) |
| Two clean Mac builds               | byte-identical                                 |

## Not covered

- `crypto_bg.wasm`: #226.
- Byte-identical builds across machines: not needed, since only CI's build ships.
  Would need Docker or a pinned clang.
- Signed provenance: GitHub attestations need Enterprise Cloud for private
  repos; the org is on Team.
