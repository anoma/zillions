#!/usr/bin/env bash
set -euo pipefail

# Netlify ships CI's build of zcore; anywhere else, build it yourself first
# (packages/zcore/build.sh).
if [ "${NETLIFY:-}" = true ]; then
    node scripts/fetch-zcore.mjs
fi

pnpm app:build
