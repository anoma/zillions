#!/usr/bin/env bash
set -euo pipefail

cp ../zillions-sdk/dist/zillions-sdk-wallet-0.1.0.tgz packages/zillions-sdk/zillions-sdk-wallet-0.1.0.tgz

npm uninstall @zillions-sdk/wallet
npm install @zillions-sdk/wallet@file:packages/zillions-sdk/zillions-sdk-wallet-0.1.0.tgz
