#!/usr/bin/env bash
# Assembles the Zcash Sapling proving parameters (2018 MPC ceremony output,
# immutable) into packages/zillions-sdk-sapling-params/.
#
# Prefers reassembling from the wagyu-zcash-parameters crates already present
# in the cargo cache (a dependency of this workspace); falls back to
# downloading from download.z.cash. Files are SHA-256 verified either way.
set -euo pipefail

OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/packages/zillions-sdk-sapling-params"
SPEND_FILE="sapling-spend.params"
OUTPUT_FILE="sapling-output.params"
SPEND_SHA256="8e48ffd23abb3a5fd9c5589204f32d9c31285a04b78096ba40a79b75677efc13"
OUTPUT_SHA256="2f0ebbcbb9bb0bcffe95a397e7eba89c29eb4dde6191c339db88570e3f3fb0e4"

mkdir -p "$OUT_DIR"
# Build artifact, like the wasm-pack out-dirs: keep the whole package out of git.
echo '*' > "$OUT_DIR/.gitignore"

valid() { # valid <path> <sha256>
  [ -f "$1" ] && echo "$2  $1" | shasum -a 256 -c - > /dev/null 2>&1
}

assemble_from_cargo_cache() {
  local base
  base=$(ls -d "$HOME"/.cargo/registry/src/*/wagyu-zcash-parameters-1-0.2.0 2> /dev/null | head -1) || return 1
  base=${base%/wagyu-zcash-parameters-1-0.2.0}
  [ -n "$base" ] || return 1
  echo "Assembling params from cargo cache ($base)"
  : > "$OUT_DIR/$SPEND_FILE"
  for i in 1 2 3 4 5; do
    cat "$base/wagyu-zcash-parameters-$i-0.2.0/src/sapling-spend-$i.params" >> "$OUT_DIR/$SPEND_FILE"
  done
  cp "$base/wagyu-zcash-parameters-6-0.2.0/src/sapling-output-1.params" "$OUT_DIR/$OUTPUT_FILE"
}

download_from_zcash() {
  echo "Downloading params from download.z.cash"
  curl -sSfL -o "$OUT_DIR/$SPEND_FILE" "https://download.z.cash/downloads/$SPEND_FILE"
  curl -sSfL -o "$OUT_DIR/$OUTPUT_FILE" "https://download.z.cash/downloads/$OUTPUT_FILE"
}

if valid "$OUT_DIR/$SPEND_FILE" "$SPEND_SHA256" && valid "$OUT_DIR/$OUTPUT_FILE" "$OUTPUT_SHA256"; then
  echo "Sapling params already present and verified"
  exit 0
fi

assemble_from_cargo_cache || download_from_zcash

valid "$OUT_DIR/$SPEND_FILE" "$SPEND_SHA256" || { echo "ERROR: $SPEND_FILE hash mismatch" >&2; exit 1; }
valid "$OUT_DIR/$OUTPUT_FILE" "$OUTPUT_SHA256" || { echo "ERROR: $OUTPUT_FILE hash mismatch" >&2; exit 1; }
echo "Sapling params verified: $OUT_DIR"
