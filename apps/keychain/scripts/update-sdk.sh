#!/usr/bin/env bash
set -euo pipefail

cp ../zillions-sdk/dist/zillions-sdk-keys-0.1.0.tgz src/packages/zillions-sdk/zillions-sdk-keys-0.1.0.tgz

npm uninstall @zillions-sdk/keys
npm install @zillions-sdk/keys@file:src/packages/zillions-sdk/zillions-sdk-keys-0.1.0.tgz
