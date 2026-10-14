#!/usr/bin/env bash
# Builds out/stock.wasm against the crates.io curve crates and out/patched.wasm
# against ../../patched/.
set -euo pipefail
cd "$(dirname "$0")"

../../patch-crates.sh
mkdir -p out
wasm=target/wasm32-unknown-unknown/release/field_bench.wasm

cargo build -q --release --target wasm32-unknown-unknown
cp "$wasm" out/stock.wasm

cargo build -q --release --target wasm32-unknown-unknown \
    --config 'patch.crates-io.pasta_curves.path="../../patched/pasta_curves-0.5.2"' \
    --config 'patch.crates-io.bls12_381.path="../../patched/bls12_381-0.8.0"'
cp "$wasm" out/patched.wasm
