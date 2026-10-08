#!/usr/bin/env bash
# Unpacks every crate patches/ holds a <crate>-<version>.patch for into
# patched/, from crates.io, checked against patches/SHA256SUMS, and applies the
# patch. Cargo.toml's [patch.crates-io] points into patched/, so every cargo
# command fails until this has run.
set -euo pipefail
cd "$(dirname "$0")"

for patch in patches/*.patch; do
    crate=$(basename "$patch" .patch)
    dir=patched/$crate
    cmp -s "$patch" "$dir/.applied.patch" && continue

    rm -rf "$dir"
    mkdir -p patched
    tmp=$(mktemp -d)
    curl -sSfL -o "$tmp/$crate.crate" "https://static.crates.io/crates/${crate%-*}/$crate.crate"
    grep " $crate.crate\$" patches/SHA256SUMS | (cd "$tmp" && shasum -a 256 -c - >/dev/null)
    tar -xzf "$tmp/$crate.crate" -C patched
    rm -rf "$tmp"
    patch -s -p1 -d "$dir" < "$patch"
    cp "$patch" "$dir/.applied.patch"
done
