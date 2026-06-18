#!/usr/bin/env bash
#
# Build the @chainsafe/webzjs-keys WASM package from the WebZjs Rust source and
# vendor the output into packages/zillions-webzjs-keys.
#
# WHY FROM SOURCE: the PUBLISHED @chainsafe/webzjs-keys@0.1.0 exposes only
# UFVK.encode() (a viewing key) — no address derivation. This script builds from
# source and injects our own bindings (kept as real files in scripts/webzjs-patch/):
#   - UnifiedSpendingKey::from_seed_phrase()              (mnemonic -> USK in-wasm)
#   - UFVK::get_unified_address()                         (default UA, sapling+orchard)
#   - UFVK::get_external_transparent_address()            (BIP-44 m/44'/133'/0'/0/0)
#   - UFVK::get_unified_address_at(j)                     (UA at a chosen diversifier)
#   - UFVK::ua_diversifier_index(addr)                    (does addr belong to this UFVK?)
# All are FULLY OFFLINE: pure key math, no network or wallet DB.
#
# The keys crate has no wallet DB, no threads, no prover — so the wasm is small
# (~2 MB) and the build is simple.
#
# Prerequisites (see https://github.com/ChainSafe/WebZjs):
#   - Rust nightly toolchain (pinned by WebZjs' rust-toolchain.toml) + rust-src
#   - wasm32-unknown-unknown target
#   - wasm-pack
#   - clang 17+
#   - git
#
# Usage:
#   npm run build:webzjs            # from apps/z-extension
#   WEBZJS_REF=<tag|branch|sha> npm run build:webzjs   # pin a version
#
set -euo pipefail

# --- resolve paths -----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUT_DIR="${APP_DIR}/src/packages/webzjs-keys"

# Committed patch files injected into / copied over the build output.
PATCH_DIR="${SCRIPT_DIR}/webzjs-patch"

# Where we clone/cache the WebZjs source (gitignored, outside the workspace).
WEBZJS_DIR="${WEBZJS_DIR:-${APP_DIR}/.webzjs-src}"
WEBZJS_REPO="${WEBZJS_REPO:-https://github.com/ChainSafe/WebZjs.git}"
WEBZJS_REF="${WEBZJS_REF:-main}"

KEYS_RS="${WEBZJS_DIR}/crates/webzjs-keys/src/keys.rs"
ERROR_RS="${WEBZJS_DIR}/crates/webzjs-keys/src/error.rs"
CARGO_TOML="${WEBZJS_DIR}/crates/webzjs-keys/Cargo.toml"

# --- preflight: required tools ----------------------------------------------
missing=0
for tool in git wasm-pack rustup cargo; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "ERROR: required tool not found: ${tool}" >&2
    missing=1
  fi
done
if [ "${missing}" -ne 0 ]; then
  echo "" >&2
  echo "Install the prerequisites (Rust nightly + rust-src, wasm32 target," >&2
  echo "wasm-pack, clang 17+). See WebZjs README." >&2
  exit 1
fi

# --- fetch / update the WebZjs source ---------------------------------------
if [ ! -d "${WEBZJS_DIR}/.git" ]; then
  echo ">> Cloning WebZjs into ${WEBZJS_DIR}"
  git clone "${WEBZJS_REPO}" "${WEBZJS_DIR}"
fi
echo ">> Checking out WebZjs ref: ${WEBZJS_REF}"
git -C "${WEBZJS_DIR}" fetch --all --tags --quiet
git -C "${WEBZJS_DIR}" checkout --quiet "${WEBZJS_REF}"
# Reset the keys crate so the patches below apply cleanly to a pristine tree.
git -C "${WEBZJS_DIR}" checkout --quiet -- crates/webzjs-keys || true
git -C "${WEBZJS_DIR}" pull --ff-only --quiet || true

# insert_after_fn <rust-file> <patch-file> <anchor-fn-signature-regex> <marker>
#
# Inserts the contents of <patch-file> immediately after the matched function
# (anchor + its body, up to the first `\n    }\n`). Idempotent: skipped if
# <marker> is already present. Fails loudly if the anchor isn't found.
insert_after_fn() {
  local rust_file="$1" patch_file="$2" anchor="$3" marker="$4"

  if grep -q "${marker}" "${rust_file}"; then
    return 0
  fi
  echo ">> Patching $(basename "${rust_file}"): + ${marker}"

  PATCH_FILE="${patch_file}" ANCHOR="${anchor}" perl -0pi -e '
    BEGIN {
      open my $fh, "<", $ENV{PATCH_FILE} or die "open patch: $!";
      local $/; our $snippet = <$fh>;
      our $anchor = $ENV{ANCHOR};
    }
    our ($snippet, $anchor);
    s/(${anchor}\s*\{.*?\n    \}\n)/$1\n$snippet/s
      or die "anchor not found: $anchor\n";
  ' "${rust_file}"

  if ! grep -q "${marker}" "${rust_file}"; then
    echo "ERROR: failed to inject ${marker} into ${rust_file}" >&2
    echo "       (upstream webzjs-keys may have changed; update the anchor/patch.)" >&2
    exit 1
  fi
}

# --- patch: extra crates for arbitrary-message signing ----------------------
# sign_arbitrary/verify_arbitrary need secp256k1's `recovery` feature (NOT
# enabled anywhere else in the graph) plus hashing/encoding helpers. All four
# versions already resolve in the workspace lockfile, so this adds no new
# downloads and unifies features (cargo features are additive). Done after the
# crates/webzjs-keys reset above so it isn't clobbered.
if ! grep -q 'features = \["alloc", "recovery"\]' "${CARGO_TOML}"; then
  echo ">> Patching webzjs-keys Cargo.toml: + secp256k1[recovery]/sha2/hex/base64"
  perl -0pi -e 's/(\[dependencies\]\n)/$1secp256k1 = { version = "0.29", default-features = false, features = ["alloc", "recovery"] }\nsha2 = "0.10"\nhex = "0.4"\nbase64 = "0.22"\n/s' "${CARGO_TOML}"
  if ! grep -q 'features = \["alloc", "recovery"\]' "${CARGO_TOML}"; then
    echo "ERROR: failed to inject signing deps into ${CARGO_TOML}" >&2
    exit 1
  fi
fi

# --- patch: address bindings ------------------------------------------------
# get_unified_address() goes after get_transparent_address(); from_seed_phrase()
# goes after the UnifiedSpendingKey constructor `new`.
insert_after_fn "${KEYS_RS}" "${PATCH_DIR}/get_unified_address.rs" \
  'pub fn get_transparent_address\(&self, network: &str\) -> Result<Option<String>, Error>' \
  'fn get_unified_address'

# get_external_transparent_address() — the standard BIP-44 m/44'/coin'/acct'/0/0
# receive address (what other wallets show), distinct from the UA-diversifier
# transparent receiver returned by WebZjs' get_transparent_address().
insert_after_fn "${KEYS_RS}" "${PATCH_DIR}/get_external_transparent_address.rs" \
  'pub fn get_transparent_address\(&self, network: &str\) -> Result<Option<String>, Error>' \
  'fn get_external_transparent_address'

insert_after_fn "${KEYS_RS}" "${PATCH_DIR}/get_unified_address_at.rs" \
  'pub fn get_transparent_address\(&self, network: &str\) -> Result<Option<String>, Error>' \
  'fn get_unified_address_at'

insert_after_fn "${KEYS_RS}" "${PATCH_DIR}/ua_diversifier_index.rs" \
  'pub fn get_transparent_address\(&self, network: &str\) -> Result<Option<String>, Error>' \
  'fn ua_diversifier_index'

# get_external_transparent_pubkey() — the secp256k1 public key (compressed hex)
# behind the index-0 external transparent address. This is the account's real
# PUBLIC key, distinct from the UFVK (a viewing key). Same UFVK impl block.
insert_after_fn "${KEYS_RS}" "${PATCH_DIR}/get_external_transparent_pubkey.rs" \
  'pub fn get_transparent_address\(&self, network: &str\) -> Result<Option<String>, Error>' \
  'fn get_external_transparent_pubkey'

insert_after_fn "${KEYS_RS}" "${PATCH_DIR}/from_seed_phrase.rs" \
  'pub fn new\(network: &str, seed: Box<\[u8\]>, hd_index: u32\) -> Result<UnifiedSpendingKey, Error>' \
  'fn from_seed_phrase'

# to_bytes_hex() — serialize the USK (the account's spending secret) for the
# popup's "Access Spending Key" reveal. Same UnifiedSpendingKey impl block.
insert_after_fn "${KEYS_RS}" "${PATCH_DIR}/to_bytes_hex.rs" \
  'pub fn new\(network: &str, seed: Box<\[u8\]>, hd_index: u32\) -> Result<UnifiedSpendingKey, Error>' \
  'fn to_bytes_hex'

# sapling_extended_spending_key() — canonical Bech32 Sapling spending key
# (secret-extended-key-main1…), shown alongside the unified key.
insert_after_fn "${KEYS_RS}" "${PATCH_DIR}/sapling_extended_spending_key.rs" \
  'pub fn new\(network: &str, seed: Box<\[u8\]>, hd_index: u32\) -> Result<UnifiedSpendingKey, Error>' \
  'fn sapling_extended_spending_key'

# sign_arbitrary() — transparent secp256k1 message signing (Bitcoin/Zcash
# signed-message format). Same UnifiedSpendingKey impl block as new().
insert_after_fn "${KEYS_RS}" "${PATCH_DIR}/sign_arbitrary.rs" \
  'pub fn new\(network: &str, seed: Box<\[u8\]>, hd_index: u32\) -> Result<UnifiedSpendingKey, Error>' \
  'fn sign_arbitrary'

# verify_arbitrary() — associated fn (no self; exported as a static method);
# recovers the signing pubkey and checks it. Same impl block.
insert_after_fn "${KEYS_RS}" "${PATCH_DIR}/verify_arbitrary.rs" \
  'pub fn new\(network: &str, seed: Box<\[u8\]>, hd_index: u32\) -> Result<UnifiedSpendingKey, Error>' \
  'fn verify_arbitrary'

# Error variant used by get_unified_address (single line — kept inline).
if ! grep -q "UnifiedAddressDerivation" "${ERROR_RS}"; then
  perl -0pi -e 's/(    TransparentAddressDerivation,\n)/$1    #[error("Failed to derive unified address from UFVK")]\n    UnifiedAddressDerivation,\n/s' "${ERROR_RS}"
fi

# --- clean previous build outputs (keep committed README) -------------------
rm -rf \
  "${OUT_DIR}/snippets" \
  "${OUT_DIR}/webzjs_keys.js" \
  "${OUT_DIR}/webzjs_keys_bg.wasm" \
  "${OUT_DIR}/webzjs_keys_bg.wasm.d.ts"

# --- build the keys crate ----------------------------------------------------
# Mirrors WebZjs' `just build-keys`. No threading/prover features needed.
echo ">> Building @zillions/webzjs-keys -> ${OUT_DIR}"
(
  cd "${WEBZJS_DIR}/crates/webzjs-keys"
  wasm-pack build \
    -t web \
    --release \
    --scope chainsafe \
    --out-dir "${OUT_DIR}" \
    --no-default-features \
    -Z build-std="panic_abort,std"
)

# --- restore our package.json + .gitignore over wasm-pack's output ----------
# wasm-pack overwrites package.json (with the upstream @chainsafe name) and
# writes a `.gitignore` of `*`. Copy ours back from the committed templates:
#  - package.json keeps the DISTINCT @zillions/webzjs-keys name so the legacy
#    app's real @chainsafe/webzjs-keys npm dep is untouched.
#  - .gitignore keeps committed files tracked, heavy artifacts ignored.
# (The generated webzjs_keys.d.ts is kept as-is — it reflects our bindings.)
echo ">> Restoring @zillions/webzjs-keys package.json + .gitignore"
cp "${PATCH_DIR}/package.json" "${OUT_DIR}/package.json"
cp "${PATCH_DIR}/gitignore" "${OUT_DIR}/.gitignore"

echo ">> Done. Vendored artifacts:"
ls -1 "${OUT_DIR}"
echo ""
echo ">> Run \`npm install\` at the repo root if the package.json changed."
