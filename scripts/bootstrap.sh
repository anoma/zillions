#!/usr/bin/env bash
# A fresh checkout to one that runs: dependencies, local env files and
# zcore's wasm. Safe to re-run; it never overwrites an existing .env.
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm install

for example in apps/*/.env.example; do
    env="${example%.example}"
    if [ -e "$env" ]; then
        echo "keep    $env"
    else
        cp "$example" "$env"
        echo "created $env"
    fi
done

if [ -e packages/zcore/pkg/zcore_bg.wasm ]; then
    echo "keep    packages/zcore/pkg (run \`pnpm zcore:build\` after pulling zcore changes)"
elif command -v rustup > /dev/null; then
    pnpm zcore:build
else
    echo "zcore's wasm isn't built and rustup isn't installed: see the Setup in apps/app/README.md, then run \`pnpm zcore:build\`." >&2
    exit 1
fi
