#!/usr/bin/env bash
set -euo pipefail

# Zip the pre-built keychain extension into public/.
# Build it first: pnpm --filter zillions-keychain build:chrome
zip_name="zillions-keychain.zip"
public_dir=$(pwd)/public
keychain_out="../keychain/.output/chrome-mv3"

if [ ! -d "$keychain_out" ]; then
  echo "Keychain build output not found at $keychain_out" >&2
  echo "Run: pnpm --filter zillions-keychain build:chrome" >&2
  exit 1
fi

rm -f "${public_dir}/${zip_name}"
(cd "$keychain_out" && zip -r "${public_dir}/${zip_name}" .)

echo "Created public/${zip_name}"
