#!/usr/bin/env bash
# Builds pkg/ with every tool pinned, here or in rust-toolchain.toml. CI runs
# this same script (.github/workflows/build-wasm.yml).
set -euo pipefail
cd "$(dirname "$0")"

# The wasm-bindgen CLI must match the wasm-bindgen crate in Cargo.lock.
WASM_BINDGEN=$(grep -A1 '^name = "wasm-bindgen"$' Cargo.lock | sed -n 's/^version = "\(.*\)"$/\1/p')
BINARYEN=version_129
case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) platform=x86_64-linux sha=50b9fa62b9abea752da92ec57e0c555fee578760cd237c40107957715d2976ba ;;
    Darwin-arm64) platform=arm64-macos sha=d1bb014775ca3002506712b81b4406d126ff6845e8b2f343bc2696a1a88b7117 ;;
    Darwin-x86_64) platform=x86_64-macos sha=cc38897d3d93c968f24819fae210e04afd0146d0e2467e307207ea7e798a59b9 ;;
    *) echo "error: no pinned binaryen for $(uname -sm)" >&2; exit 1 ;;
esac

# secp256k1-sys compiles C to wasm32. If the default clang can't target it
# (e.g. Apple's system clang), fall back to a Homebrew LLVM that can.
if ! echo 'int f(void){return 0;}' | "${CC:-clang}" --target=wasm32-unknown-unknown -x c -c - -o /dev/null 2>/dev/null; then
    # `brew --prefix` prints the path even when llvm isn't installed.
    LLVM_PREFIX=$(brew --prefix llvm 2>/dev/null) && [ -x "$LLVM_PREFIX/bin/clang" ] || {
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
# Keeps machine paths (home, rust-src) out of panic messages. The last
# matching remap wins, so the most specific goes last.
sysroot=$(rustc --print sysroot)
rustc_commit=$(rustc -vV | sed -n 's/^commit-hash: //p')
remap="--remap-path-prefix=$HOME=~ --remap-path-prefix=$PWD=. --remap-path-prefix=$sysroot/lib/rustlib/src/rust=/rustc/$rustc_commit"
RUSTFLAGS="$remap" cargo build --lib --release --locked --target wasm32-unknown-unknown
# pkg/mt, the threaded prover. Shared memory needs std rebuilt with atomics
# (-Z build-std), which RUSTC_BOOTSTRAP allows on the pinned stable toolchain.
RUSTC_BOOTSTRAP=1 CFLAGS_wasm32_unknown_unknown="-matomics -mbulk-memory" \
    RUSTFLAGS="$remap -C target-feature=+atomics,+bulk-memory,+mutable-globals \
    -C link-arg=--shared-memory -C link-arg=--import-memory -C link-arg=--max-memory=1073741824 \
    -C link-arg=--export=__wasm_init_tls -C link-arg=--export=__tls_size \
    -C link-arg=--export=__tls_align -C link-arg=--export=__tls_base" \
    cargo build --lib --release --locked --target wasm32-unknown-unknown \
    --features threads --target-dir target/mt -Z build-std=panic_abort,std
rm -rf pkg
"$tools/bin/wasm-bindgen" target/wasm32-unknown-unknown/release/zcore.wasm --out-dir pkg --target web
"$tools/bin/wasm-bindgen" target/mt/wasm32-unknown-unknown/release/zcore.wasm --out-dir pkg/mt --target web
"$wasm_opt" pkg/zcore_bg.wasm -o pkg/zcore_bg.wasm -O4
"$wasm_opt" pkg/mt/zcore_bg.wasm -o pkg/mt/zcore_bg.wasm -O4
node source-hash.mjs > pkg/.source-hash
