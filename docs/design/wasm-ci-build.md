# zcore wasm built in GitHub Actions

Status: plan, updated 2026-11-12. Step 1 is PR #229.

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

### 1. Pinned build (PR #229)

`rust-toolchain.toml` pins Rust; `build.sh` pins the `wasm-bindgen` CLI and
binaryen, installs them into `.tools/`, and remaps machine paths out of the
wasm. `build-wasm.yml` builds, runs `smoke.mjs`, and uploads `pkg/`.

Still to add: remap the Rust standard library's source path (a Mac with
`rust-src` installed otherwise embeds it), and have `build.sh` write
`pkg/.source-hash`.

### 2. When CI builds

`build-wasm.yml` runs on:

- **push to any branch, only when zcore changes** (`paths:` on
  `packages/zcore/**` and the workflow). A JS-only push runs nothing.
- **a weekly schedule on `main`**, which re-uploads `main`'s artifact (from the
  cache, ~15 s) so it never reaches its 90-day expiry and the cache isn't evicted
  after 7 idle days.
- **`workflow_call`** from `ci.yml`, whose check and e2e jobs need `pkg/` on
  every PR. With the cache keyed on the source hash, a JS-only PR restores
  `main`'s build in ~15 s instead of compiling. Those uploads use a short
  retention, since only the run itself reads them.

### 3. Netlify fetches the wasm

Netlify's build command runs `scripts/build.sh`, which on Netlify (`NETLIFY=true`)
first runs a fetch script (Node, no dependencies, ~40 lines):

1. Hash zcore's source in the checkout.
2. Look up the newest unexpired artifact `zcore-pkg-<hash>` in this repo.
   - **Production** (`CONTEXT=production`): only from push or scheduled runs on
     `main` or `production`. A branch can run any workflow code, so without
     this a branch could upload a tampered build under `main`'s hash and
     production would pick it up unreviewed.
   - **Previews and branch deploys**: from any run in this repo.
3. None yet: find the CI run for `COMMIT_REF` (it may take a few seconds to
   appear) and poll every 20 s until it finishes, then look again. Fail with a
   clear message if the run fails or none appears.
4. Download, check the zip against the artifact's SHA-256 digest, unpack into
   `packages/zcore/pkg`.

A read-only fine-grained GitHub token (this repo, Actions: read) lives in
Netlify's env vars. Netlify withholds secrets from fork PR previews, so those
fail until approved.

Timing: when zcore didn't change, a few seconds for the download. When it did,
Netlify waits for CI (~3 min with warm Rust caches, ~5½ cold), which counts
against Netlify build minutes. `production` is a commit already on `main`, so
its artifact always exists and it never waits.

`scripts/build.sh` drops the keychain build and zip, leaving the fetch and the
app build.

### 4. Keychain release

`release-please.yml`'s `keychain-zip` job downloads the same artifact (from
`main`'s runs) before `pnpm keychain:zip`, so the zip on the GitHub release,
the one the stores get, carries CI's wasm. It records the wasm's and zip's
SHA-256 in the release notes.

### 5. Stop committing `pkg/`

`git rm -r --cached packages/zcore/pkg`, gitignore it, and say in the README
that the app needs `packages/zcore/build.sh` run once (and after zcore
changes).

## Order of work

1. PR #229: pinned build, `build-wasm.yml`, trial. Then: std-path remap,
   `.source-hash`, triggers (push + paths, weekly, `workflow_call`).
2. Fetch script + `scripts/build.sh` on Netlify; drop the keychain zip;
   Netlify token. Tested on a deploy preview while `pkg/` is still committed.
3. `ci.yml` and the keychain release take the artifact; `pkg/` removed from git;
   README.

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
