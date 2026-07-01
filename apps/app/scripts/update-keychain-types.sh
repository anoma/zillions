#!/usr/bin/env bash
set -euo pipefail

cp ../zillions-extension/src/packages/types/src/*.ts src/lib/keychain/types/src/

npx prettier --write src/lib/keychain/types/src/*.ts
