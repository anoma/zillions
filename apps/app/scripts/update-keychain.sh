#!/usr/bin/env bash
set -euo pipefail

# Copy types
cp ../zillions-extension/src/packages/types/src/*.ts src/lib/keychain/types/src/

npx prettier --write src/lib/keychain/types/src/*.ts

echo "Copied keychain types"

# Zip the pre-built extension into public/
zip_name="zillions-keychain.zip"
public_dir=$(pwd)/public

rm -f "${public_dir}/${zip_name}"
(cd ../zillions-extension/.output/chrome-mv3 && zip -r "${public_dir}/${zip_name}" .)

echo "Created public/${zip_name}"
