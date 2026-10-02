#!/usr/bin/env bash
set -euo pipefail

# Build keychain
pnpm keychain:build

# Zip the keychain extension and copy to app public folder
root_dir=$(pwd)
(cd "apps/keychain/.output/chrome-mv3" && zip -r "${root_dir}/apps/app/public/zillions-keychain.zip" .)

# Build app with the keychain zip
pnpm app:build
