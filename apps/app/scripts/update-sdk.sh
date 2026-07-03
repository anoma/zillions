#!/usr/bin/env bash
set -euo pipefail

cp ../zillions-sdk/dist/zillions-sdk-wallet-0.1.0.tgz packages/zillions-sdk/zillions-sdk-wallet-0.1.0.tgz
cp ../zillions-sdk/dist/zillions-sdk-sapling-params-1.0.0.tgz packages/zillions-sdk/zillions-sdk-sapling-params-1.0.0.tgz

npm uninstall @zillions-sdk/wallet @zillions-sdk/sapling-params
npm install @zillions-sdk/wallet@file:packages/zillions-sdk/zillions-sdk-wallet-0.1.0.tgz \
  @zillions-sdk/sapling-params@file:packages/zillions-sdk/zillions-sdk-sapling-params-1.0.0.tgz
