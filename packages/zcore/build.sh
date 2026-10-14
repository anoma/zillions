#!/usr/bin/env bash
# Builds the wasm package into pkg/, which is committed.
set -euo pipefail
cd "$(dirname "$0")"

# secp256k1-sys compiles C to wasm32. If the default clang can't target it
# (e.g. Apple's system clang), fall back to a Homebrew LLVM that can.
if ! echo 'int f(void){return 0;}' | "${CC:-clang}" --target=wasm32-unknown-unknown -x c -c - -o /dev/null 2>/dev/null; then
    LLVM_PREFIX=$(brew --prefix llvm 2>/dev/null) || {
        echo "error: clang cannot target wasm32 and Homebrew LLVM was not found." >&2
        echo "install it with: brew install llvm" >&2
        exit 1
    }
    export CC="$LLVM_PREFIX/bin/clang"
    export AR="$LLVM_PREFIX/bin/llvm-ar"
fi

./patch-crates.sh
wasm-pack build --target web --release --out-dir pkg --no-pack
rm -f pkg/.gitignore
