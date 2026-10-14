#!/usr/bin/env bash
# Builds pkg/ (wasm reference) for index.html.
set -euo pipefail
cd "$(dirname "$0")"
../../patch-crates.sh
wasm-pack build --target web --release --out-dir pkg --no-pack
