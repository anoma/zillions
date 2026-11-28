# zcore wasm built in GitHub Actions

Status: built in PR #229, 2026-11-12.

## Problem

`packages/zcore/pkg/zcore_bg.wasm` (6 MB) ships in the app and the keychain.
It is built on a developer's laptop and committed. Nobody can review a binary
diff, so whoever commits `pkg/` decides what runs, whatever the Rust source
says. It also drifts: #228 changed `roles.rs` without rebuilding `pkg/`, and
the committed wasm carried its builder's home directory in 235 panic strings.

The keychain's other wasm, `crypto_bg.wasm`, had no source in the repo at all.
[#226](https://github.com/anoma/zillions-frontend/issues/226) moved its Argon2id
into zcore and the rest to WebCrypto and `@scure/bip39`, so zcore is the only
wasm left.

## Decided

- **`pkg/` is not committed.** Every developer builds zcore with `build.sh`
  (rustup + a clang that targets wasm32), as Rust developers do today.
- **Only CI's build ships.** Netlify and the keychain release download the
  artifact CI built for the exact zcore source; nothing ships a local build.
- **Netlify keeps building the site** (deploy previews, branch deploys,
  production from `production`); it only fetches the wasm instead of building it.
- **`/zillions-keychain.zip` is dropped.** Nothing links to it; the keychain
  ships only from GitHub releases.

## How a commit finds its wasm

`source-hash.mjs` hashes everything `build.sh` turns into `pkg/`: every file git
tracks under `packages/zcore` except ones that can't affect the build (docs,
`examples/`, `patches/bench/`, helper scripts), plus Cargo configs in parent
directories (`packages/.cargo/`, `.cargo/`) and `build-wasm.yml`. New files count
by default, so an input added later (a Cargo build script, a `.cargo/config.toml`,
an `include_bytes!` target) can't change the build without changing the hash,
which would otherwise let CI's cache keep serving the old build. CI names its
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

`build-wasm.yml` only runs when `ci.yml` calls it: on every PR and every push to
`main`. Its cache is keyed on the source hash, so a source that didn't change
restores its build in ~15 s instead of compiling. `production` only ever gets
commits already on `main`, whose builds exist.

PR runs build the PR merged into `main`, while Netlify previews build the PR's
own commit. Their hashes match unless `main` changed zcore after the branch was
cut; then the preview finds no build and fails, asking to merge `main`.

Artifacts from `main` and `production` are kept 90 days, everything else 14.
GitHub can't extend an artifact's expiry, but `ci.yml` re-uploads `main`'s
build (a cache hit, ~15 s) on every push to `main`, so it only expires after 90
days without a push to `main`. Then deploys fail until someone pushes to `main`
or reruns its CI.

### 3. Netlify fetches the wasm

Netlify's build command, `pnpm run build`, runs `scripts/build.sh`: on Netlify
(`NETLIFY=true`) it runs `scripts/fetch-zcore.mjs`, then builds the app. The
keychain build and `/zillions-keychain.zip` are gone.

`fetch-zcore.mjs`:

1. Hashes zcore's source in the checkout.
2. Looks up the newest unexpired artifact `zcore-pkg-<hash>` in this repo.
   - **Production and `main`'s branch deploy** (`CONTEXT=production` or
     `BRANCH=main`): only from push runs on `main` or `production`. A branch
     can run any workflow code, so without this a branch could upload a
     tampered build under `main`'s hash and a public deploy would pick it up
     unreviewed. `main`'s deploy therefore waits for `main`'s own CI after a
     merge (~15 s when zcore didn't change).
   - **Previews and other branch deploys**: from any run in this repo.
3. If there is none yet, polls every 20 s while `ci.yml` runs for
   `COMMIT_REF` or for a push to `main` (release-please's PR has no CI of its
   own and opens while `main`'s merge build is still running); fails with a clear message if no run shows up within two
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

## Measured

|                                              | Time                                           |
| -------------------------------------------- | ---------------------------------------------- |
| CI wasm build, cold                          | 5m30s                                          |
| CI wasm build, warm Rust caches              | 2m55s                                          |
| CI wasm job, cached build                    | 15s                                            |
| Draft deploy to Netlify via API              | 22s                                            |
| Mac vs CI build of the same source           | not byte-identical (clang 23 vs 18, std paths) |
| Two independent CI builds of the same source | byte-identical                                 |
| Two clean Mac builds                         | byte-identical                                 |

## Not covered

- Byte-identical builds across machines: not needed, since only CI's build ships.
  Would need Docker or a pinned clang.
- Signed provenance: GitHub attestations need Enterprise Cloud for private
  repos; the org is on Team.
