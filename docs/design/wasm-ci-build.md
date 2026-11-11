# zcore wasm built in GitHub Actions

Status: plan, 2026-11-10. Nothing built yet.

## Problem

`packages/zcore/pkg/zcore_bg.wasm` (6 MB) ships in both the app and the
keychain. It is built on a developer's laptop with `build.sh` and committed.
Nobody can review a binary diff, so whoever commits `pkg/` decides what runs,
whatever the Rust source says. A compromised laptop, a stale local patch, or a
tool `wasm-pack` fetched at build time goes straight to production. Netlify
then builds `production` on its own servers from whatever wasm is committed.

The keychain's other wasm, `crypto_bg.wasm`, has no source in the repo at all.
It is out of scope here: [#226](https://github.com/anoma/zillions-interface/issues/226).

## Reference: anoma-app-sdk

`anoma/anoma-app-sdk` (arm-bindings) is the model:

- **Nothing built is committed.** `generated/`, `pkg`, `target` are gitignored;
  CI builds everything from source.
- **One reusable build workflow** (`build-arm-bindings.yml`, `workflow_call`)
  is called by both PR CI and the release, "so the two cannot drift". A green
  PR means a publishable build.
- **The release ships the exact artefact CI checked:** the build job packs and
  uploads; the publish job downloads that tarball and publishes it verbatim.
- **Toolchain pinned in the repo** (`rust-toolchain.toml`), installed by a
  composite action that fails early.
- **Provenance** (npm `provenance: true`), with `id-token: write` granted only
  to the publish job.
- A smoke test loads the built output as a consumer would.

## Decided

- **`pkg/` is no longer committed.** CI is the only producer of shipped wasm.
  This reverses the monorepo's "wasm committed" policy.
- **zcore only.** `crypto_bg.wasm` stays committed until #226.
- **Nobody needs Rust to work on the app.** Non-Rust developers download CI's
  build; Rust developers keep building locally.

## Plan

### 1. Pinned zcore build

- `packages/zcore/rust-toolchain.toml`: exact channel (`1.97.1`, not
  `stable`), `wasm32-unknown-unknown` target, `rustfmt`.
- `build.sh` drops `wasm-pack` for the three steps it wraps, each pinned:
  1. `cargo build --release --locked --target wasm32-unknown-unknown`
  2. `wasm-bindgen --target web --out-dir pkg`, CLI at `Cargo.lock`'s
     `wasm-bindgen` version (today 0.2.130), `cargo install`ed into `.tools/`
  3. `wasm-opt -O4` from binaryen `version_111` (what wasm-pack 0.12.1 used),
     downloaded into `.tools/` and checked against a SHA-256 in `build.sh`

  `wasm-pack` downloads `wasm-bindgen` and `wasm-opt` itself when they're
  missing; explicit steps put every tool version in review. `build.sh` owns the
  tools, so a local build and CI's use the same ones with no setup beyond
  rustup and clang. Upgrading binaryen is a separate change.

- `--remap-path-prefix` for `$HOME` and the checkout. Today's committed
  `zcore_bg.wasm` carries the builder's home directory in 235 panic strings.
- `patch-crates.sh` is unchanged: it already checks crate SHA-256s.
- `source-hash.mjs` prints the hash of every build input; `build.sh` will write
  it to `pkg/.source-hash` (see 3).

### 2. One reusable build workflow

`.github/workflows/build-wasm.yml` (`workflow_call`, input `cache`), modelled
on `build-arm-bindings.yml`:

- `runs-on: ubuntu-24.04` (pinned image; its clang compiles `secp256k1-sys`).
- `rustup toolchain install` (reads `rust-toolchain.toml`), then `./build.sh`,
  then `smoke.mjs`: Node loads `pkg/` and derives an account from a test seed.
- Uploads `pkg/` as artifact `zcore-pkg-<source hash>` (retention 90 days) and
  writes the wasm's SHA-256 and size, next to the committed one's, to the job
  summary.
- With `cache: true`, `pkg/` is restored from `actions/cache` keyed on the
  source hash and the build is skipped. GitHub scopes caches per branch, so a PR
  can't poison `main`'s. Releases pass `cache: false`.

### 3. Local dev: download CI's build

`pnpm zcore:fetch` (`packages/zcore/fetch.mjs`, Node, no new dependency), also
run by the app's and keychain's `predev`:

1. Hash zcore's build inputs from the working tree (`src/`, `Cargo.*`,
   `patches/`, `build.sh`, `patch-crates.sh`, `rust-toolchain.toml`). The same
   script computes the hash in CI, so the two can't disagree.
2. `pkg/.source-hash` matches → done (instant; this is the usual case, and the
   case after a Rust developer's own build).
3. Otherwise ask the GitHub API, through `gh`, for the newest unexpired
   artifact named `zcore-pkg-<hash>`, **from a run on `main` or on the branch
   checked out**. Other branches are ignored: any PR's workflow could upload a
   tampered artifact under `main`'s hash.
4. Download, check the zip against the artifact's SHA-256 digest from the API,
   unpack into `pkg/`.
5. No artifact → stop with: push and wait for CI, or build it with Rust
   (`pnpm --filter @zillions/zcore build`).

Needs the `gh` CLI, logged in: the repo is private, and artifact downloads
always need auth. That is the only setup an app developer needs.

Other options considered:

| Option                                                  | Why not                                                                                                     |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Fetch "latest `main`" instead of by hash                | Wrong wasm as soon as a branch changes zcore, and stale after pulling; the hash catches both                |
| Rolling GitHub release asset (`zcore-latest`)           | Covers `main` only; still needs auth (private repo); one more thing to keep updated                         |
| Publish `@zillions/zcore` to GitHub Packages per commit | Apps would depend on a version, not `workspace:*`, which breaks PRs that change Rust and app together; auth |
| pkg.pr.new (what anoma-app-sdk uses for previews)       | Third-party service holding our wasm; private-repo support unclear                                          |
| Devcontainer / Codespaces with Rust                     | Still a full Rust build per change; slow                                                                    |

### 4. CI consumers take the artefact

- `ci.yml`: a `wasm` job (`uses: ./.github/workflows/build-wasm.yml`, `cache:
true`); `check`, `keychain` and `e2e` add `needs: wasm` and download the
  artifact into `packages/zcore/pkg` before `pnpm install`. Typecheck needs
  `zcore.d.ts`, so `check` needs it too.
- `zcore.yml` keeps `cargo test` + audit; its paths filter adds
  `rust-toolchain.toml` and the new workflow/action.

**PRs that change Rust and app code together** work better than today: the PR's
`wasm` job builds the PR's zcore, and the app's lint, tests and e2e run against
that build. Today they run against whatever `pkg/` the author remembered to
rebuild. A reviewer without Rust checks out the branch and `predev` fetches
that PR's build once CI has run. The cost: when zcore changes, app jobs wait
for the Rust build (time unmeasured); app-only PRs hit the cache.

### 5. Releases ship a fresh CI build

- `release-please.yml`: `keychain-zip` runs `build-wasm` at the release tag
  with `cache: false`, zips, uploads to the release, and puts the zip's and
  `zcore_bg.wasm`'s SHA-256 in the release notes.
- Provenance attestations (`actions/attest-build-provenance`) need GitHub
  Enterprise Cloud for private repos; the org is on Team. Add them if the repo
  goes public or the plan changes.
- Netlify: see below.

### 6. Netlify

Netlify can't build the app any more without wasm. Options:

| Option                                                                                          | Good                                                           | Bad                                                                                                                          |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **A. Build in Actions, `netlify deploy --prod`** (`netlify-cli` pinned devDependency)           | Ships exactly the fresh tag build; one place builds everything | `NETLIFY_AUTH_TOKEN` secret in GitHub; turn off Netlify's git builds; PR previews (if used) move to `netlify deploy --alias` |
| **B. Netlify keeps building, its build runs `zcore:fetch`** (read-only GitHub token in Netlify) | Smallest change; Netlify previews and settings stay            | Ships a `main` artifact looked up by hash, not a build at the tag; previews of zcore-changing PRs fail until CI finishes     |
| C. Netlify builds Rust itself                                                                   | No tokens                                                      | Not built in Actions, which is the point; slow; Netlify build minutes                                                        |
| D. Leave Netlify for GitHub Pages (`actions/deploy-pages`, OIDC, no token)                      | No third-party token at all                                    | No `_redirects` (SPA fallback via `404.html`), no previews, domain move; a hosting decision                                  |

Recommendation: **A**. B is acceptable if keeping Netlify-native previews
matters more than shipping the exact tag build.

## Order of work

Each line is one PR; each leaves `main` releasable.

1. Pinned toolchain, `build.sh` without wasm-pack, `build-wasm.yml` with smoke
   test and source hash. Runs alongside the committed `pkg/`; no consumer
   changes. A temporary `wasm-trial.yml` runs the whole flow (wasm → check,
   e2e, site build) on CI's wasm, deploying nowhere, to measure it.
2. `zcore:fetch` + `predev`; CI jobs take the artifact; `pkg/` removed from git
   and gitignored; README: install `gh`, `gh auth login`.
3. Netlify (A or B) and the keychain zip from a fresh tag build. Needs a
   Netlify token and someone with Netlify admin.

## Not covered

- `crypto_bg.wasm`: #226.
- Bit-identical builds across macOS and Linux: not a goal; CI's build is the
  one that ships.
