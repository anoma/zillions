#!/usr/bin/env bash
# Builds pkg/ with every tool pinned, here or in rust-toolchain.toml. CI runs
# this same script (.github/workflows/build-wasm.yml).
set -euo pipefail
cd "$(dirname "$0")"

# The wasm-bindgen CLI must match the wasm-bindgen crate in Cargo.lock.
WASM_BINDGEN=$(grep -A1 '^name = "wasm-bindgen"$' Cargo.lock | sed -n 's/^version = "\(.*\)"$/\1/p')
BINARYEN=version_111
case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) platform=x86_64-linux sha=2f340545b302c706bf22d2ee2382ae53a73f32bd62cb3435fb9404303c4dc940 ;;
    Darwin-arm64) platform=arm64-macos sha=dea7d0e6330fd9130209cd9bf0a24b9f3b934061236ce008c0031f2f0faf70eb ;;
    Darwin-x86_64) platform=x86_64-macos sha=232cd9b948fe3009498e298ebd1b5eb777a688a04fe05dd96898823cd5ea6dec ;;
    *) echo "error: no pinned binaryen for $(uname -sm)" >&2; exit 1 ;;
esac

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

tools=$PWD/.tools
if [ "$("$tools/bin/wasm-bindgen" --version 2>/dev/null | cut -d' ' -f2)" != "$WASM_BINDGEN" ]; then
    cargo install wasm-bindgen-cli --version "$WASM_BINDGEN" --locked --root "$tools"
fi
wasm_opt=$tools/binaryen-$BINARYEN/bin/wasm-opt
if [ ! -x "$wasm_opt" ]; then
    tarball=binaryen-$BINARYEN-$platform.tar.gz
    tmp=$(mktemp -d)
    curl -sSfL -o "$tmp/$tarball" "https://github.com/WebAssembly/binaryen/releases/download/$BINARYEN/$tarball"
    (cd "$tmp" && echo "$sha  $tarball" | shasum -a 256 -c - >/dev/null)
    mkdir -p "$tools"
    tar -xzf "$tmp/$tarball" -C "$tools"
    rm -rf "$tmp"
fi

./patch-crates.sh
# Without the remaps, the builder's home directory ends up in panic messages.
RUSTFLAGS="--remap-path-prefix=$HOME=~ --remap-path-prefix=$PWD=." \
    cargo build --lib --release --locked --target wasm32-unknown-unknown
rm -rf pkg
"$tools/bin/wasm-bindgen" target/wasm32-unknown-unknown/release/zcore.wasm --out-dir pkg --target web
"$wasm_opt" pkg/zcore_bg.wasm -o pkg/zcore_bg.wasm -O4
