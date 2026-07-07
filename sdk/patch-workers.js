#!/usr/bin/env node
/**
 * patch-workers.js
 *
 * Post-build patch that makes the zillions-sdk-wallet package compatible with Vite.
 *
 * Vite fails with "Circular worker imports detected" because the rayon thread
 * pool setup creates two circular chains:
 *
 *   Chain 1 (self-referential):
 *     zillions_sdk_wallet.js → (static) workerHelpers.js
 *     workerHelpers.js → new Worker('./workerHelpers.js')  ← self-spawn
 *     Vite bundles workerHelpers.js as worker entry
 *       → import('../../..') → zillions_sdk_wallet.js → imports workerHelpers.js → CIRCULAR
 *
 *   Chain 2 (mutual):
 *     zillions_sdk_wallet.js → (static) module_worker_start.js
 *     module_worker_start.js → new Worker('./web_worker_module.bundler.js')
 *     Vite bundles web_worker_module.bundler.js as worker entry
 *       → static import '../../../../../' → zillions_sdk_wallet.js
 *       → imports module_worker_start.js → spawns bundler.js → CIRCULAR
 *
 * Fix:
 *   - Split workerHelpers.js: module stays as-is (module-only, spawns
 *     workerHelpers.worker.js instead of itself); new workerHelpers.worker.js
 *     is the actual worker entry and uses /* @vite-ignore * / on its dynamic
 *     import so Vite skips analysis.
 *   - web_worker_module.bundler.js already patched by add-worker-module.sh to
 *     use /* @vite-ignore * / dynamic import.
 *   - module_worker_start.js gains a __setWalletUrl() setter and forwards the
 *     URL to each spawned worker via a __wallet_init message.
 *   - zillions_sdk_wallet.js calls __setWalletUrl(import.meta.url) and passes
 *     import.meta.url to startWorkers so workers can load the wallet module
 *     at the correct production URL without static imports.
 */

const fs = require('fs');
const path = require('path');

const WALLET_PKG = path.join('packages', 'zillions-sdk', 'wasm', 'wallet');
const snippetsDir = path.join(WALLET_PKG, 'snippets');

// ── Locate snippet directories ────────────────────────────────────────────────

const entries = fs.readdirSync(snippetsDir);
const rayonDir = entries.find(e => e.startsWith('wasm-bindgen-rayon-'));
const wasm_threadDir = entries.find(e => e.startsWith('wasm_thread-'));

if (!rayonDir || !wasm_threadDir) {
    console.error('Error: could not find snippet directories in', snippetsDir);
    process.exit(1);
}

const rayonSrcDir = path.join(snippetsDir, rayonDir, 'src');
const wasm_threadJsDir = path.join(snippetsDir, wasm_threadDir, 'src', 'wasm32', 'js');

// ── 1. Patch workerHelpers.js ─────────────────────────────────────────────────

const workerHelpersPath = path.join(rayonSrcDir, 'workerHelpers.js');
let workerHelpers = fs.readFileSync(workerHelpersPath, 'utf8').replace(/\r\n/g, '\n');

// (a) Remove the worker entry block (the self.onmessage handler part):
//     waitForMsgType(self, 'wasm_bindgen_worker_init').then(...) { ... });
//     This block makes workerHelpers.js a dual module+worker-entry, which
//     triggers the circular import. It moves to workerHelpers.worker.js.
const entryBlockStart = workerHelpers.indexOf("\nwaitForMsgType(self, 'wasm_bindgen_worker_init')");
const entryBlockEnd   = workerHelpers.indexOf('\n});\n', entryBlockStart) + '\n});\n'.length;
if (entryBlockStart === -1 || entryBlockEnd <= entryBlockStart) {
    console.error('Error: could not locate worker entry block in workerHelpers.js');
    process.exit(1);
}
workerHelpers = workerHelpers.slice(0, entryBlockStart + 1) + workerHelpers.slice(entryBlockEnd);

// (b) Add walletUrl parameter to startWorkers
workerHelpers = workerHelpers.replace(
    'export async function startWorkers(module, memory, builder) {',
    'export async function startWorkers(module, memory, builder, walletUrl) {'
);

// (c) Pass walletUrl through the workerInit message so the worker can use it
workerHelpers = workerHelpers.replace(
    '    receiver: builder.receiver()\n  };',
    '    receiver: builder.receiver(),\n    walletUrl,\n  };'
);

// (d) Spawn the dedicated worker entry file instead of self-referencing
workerHelpers = workerHelpers.replace(
    "new URL('./workerHelpers.js', import.meta.url)",
    "new URL('./workerHelpers.worker.js', import.meta.url)"
);

fs.writeFileSync(workerHelpersPath, workerHelpers);
console.log('✓ Patched workerHelpers.js (removed worker entry, added walletUrl param)');

// ── 2. Create workerHelpers.worker.js ────────────────────────────────────────

// The actual worker entry. Uses /* @vite-ignore */ on the dynamic import so
// Vite skips static analysis and never creates the circular worker chain.
// At runtime, walletUrl is the production URL of zillions_sdk_wallet.js passed
// through the wasm_bindgen_worker_init postMessage.
const workerHelpersWorkerContent = `\
function waitForMsgType(target, type) {
  return new Promise(resolve => {
    target.addEventListener('message', function onMsg({ data }) {
      if (data?.type !== type) return;
      target.removeEventListener('message', onMsg);
      resolve(data);
    });
  });
}

waitForMsgType(self, 'wasm_bindgen_worker_init').then(async ({ init, receiver, walletUrl }) => {
  const pkg = await import(/* @vite-ignore */ walletUrl);
  await pkg.default(init);
  postMessage({ type: 'wasm_bindgen_worker_ready' });
  pkg.wbg_rayon_start_worker(receiver);
});

// Keeps Worker objects rooted to prevent Firefox GC bug:
// https://bugzilla.mozilla.org/show_bug.cgi?id=1702191
let _workers;
`;

fs.writeFileSync(path.join(rayonSrcDir, 'workerHelpers.worker.js'), workerHelpersWorkerContent);
console.log('✓ Created workerHelpers.worker.js (worker entry with @vite-ignore)');

// ── 3. Patch module_worker_start.js ──────────────────────────────────────────

// Add __setWalletUrl() so zillions_sdk_wallet.js can inject the production URL.
// Sends __wallet_init to each spawned worker before wasm posts its data.
const moduleWorkerStartContent = `\
let _walletUrl = '';
let _worker;

export function __setWalletUrl(url) {
  _walletUrl = url;
}

export function startWorker() {
  const worker = new Worker(
    new URL('./web_worker_module.bundler.js', import.meta.url),
    {
      type: 'module',
      name: 'wasm_thread'
    }
  );
  _worker = worker;
  worker.postMessage({ type: '__wallet_init', walletUrl: _walletUrl });
  return worker;
}
`;

fs.writeFileSync(path.join(wasm_threadJsDir, 'module_worker_start.js'), moduleWorkerStartContent);
console.log('✓ Patched module_worker_start.js (added __setWalletUrl, sends __wallet_init)');

// ── 4. Patch zillions_sdk_wallet.js ─────────────────────────────────────────────────

const walletJsPath = path.join(WALLET_PKG, 'zillions_sdk_wallet.js');
let walletJs = fs.readFileSync(walletJsPath, 'utf8').replace(/\r\n/g, '\n');

// (a) After the module_workers_polyfill import, inject __setWalletUrl call so
//     module_worker_start.js knows the production URL of this module.
const polyfillImportRe = /^(import \* as __wbg_star1 from '\.\/snippets\/[^']+\/module_workers_polyfill\.min\.js';)/m;
if (!polyfillImportRe.test(walletJs)) {
    console.error('Error: could not find module_workers_polyfill import in zillions_sdk_wallet.js');
    process.exit(1);
}
walletJs = walletJs.replace(
    polyfillImportRe,
    "$1\n__wbg_star0.__setWalletUrl(import.meta.url);"
);

// (b) Pass import.meta.url to startWorkers so it propagates to workers via
//     the wasm_bindgen_worker_init postMessage.
const startWorkersCall = 'const ret = startWorkers(arg0, arg1, wbg_rayon_PoolBuilder.__wrap(arg2));';
if (!walletJs.includes(startWorkersCall)) {
    console.error('Error: could not find startWorkers call in zillions_sdk_wallet.js');
    process.exit(1);
}
walletJs = walletJs.replace(
    startWorkersCall,
    'const ret = startWorkers(arg0, arg1, wbg_rayon_PoolBuilder.__wrap(arg2), import.meta.url);'
);

fs.writeFileSync(walletJsPath, walletJs);
console.log('✓ Patched zillions_sdk_wallet.js (__setWalletUrl call + import.meta.url to startWorkers)');

console.log('\nAll patches applied. Run "just pack" to produce the new tarballs.');
