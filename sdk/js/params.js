/**
 * Lazy loader for the Zcash Sapling proving parameters.
 *
 * The params (~50 MB) are not embedded in the wasm. Call loadProverParams()
 * once after wasm init — typically fire-and-forget at app start — and await
 * the same promise before proving/sending. Files are cached in IndexedDB
 * keyed by content version, so they are downloaded once per browser, ever,
 * regardless of which URL they were fetched from.
 *
 * Bytes are SHA-256 verified before being handed to the wasm: initSaplingParams
 * panics (aborting the wasm instance) on bad params, so corrupt cache entries
 * or wrong URLs must be caught here, in recoverable JS, instead.
 */

import { initSaplingParams, saplingParamsLoaded } from './zillions_sdk_wallet.js';

// Where the vite plugin serves @zillions-sdk/sapling-params from.
const DEFAULT_BASE_URL = '/zillions-sdk-sapling-params/';

const FILES = [
  {
    name: 'sapling-spend.params',
    cacheKey: 'sapling-spend-v1',
    sha256: '8e48ffd23abb3a5fd9c5589204f32d9c31285a04b78096ba40a79b75677efc13',
  },
  {
    name: 'sapling-output.params',
    cacheKey: 'sapling-output-v1',
    sha256: '2f0ebbcbb9bb0bcffe95a397e7eba89c29eb4dde6191c339db88570e3f3fb0e4',
  },
];

const DB_NAME = 'zillions-sdk-sapling-params';
const STORE = 'params';

let loadPromise;

/**
 * Downloads (or restores from IndexedDB) the Sapling proving parameters and
 * installs them into the wasm. Idempotent: concurrent and repeat calls share
 * one in-flight promise; a failed attempt can be retried by calling again.
 *
 * Must be called after the wallet wasm module has been initialized.
 *
 * @param {string} [baseUrl] Base URL to fetch the .params files from.
 *   Defaults to the files served out of @zillions-sdk/sapling-params.
 * @returns {Promise<void>}
 */
export function loadProverParams(baseUrl = DEFAULT_BASE_URL) {
  loadPromise ??= load(baseUrl).catch((e) => {
    loadPromise = undefined;
    throw e;
  });
  return loadPromise;
}

/** Returns whether the params are already installed in the wasm. */
export function proverParamsLoaded() {
  return saplingParamsLoaded();
}

async function load(baseUrl) {
  if (saplingParamsLoaded()) return;

  // Best-effort: reduce the odds of the browser evicting the cached params.
  navigator.storage?.persist?.().catch(() => {});

  const [spend, output] = await Promise.all(FILES.map((f) => loadFile(baseUrl, f)));
  initSaplingParams(new Uint8Array(spend), new Uint8Array(output));
}

async function loadFile(baseUrl, file) {
  const cached = await cacheGet(file.cacheKey);
  if (cached && (await sha256Hex(cached)) === file.sha256) return cached;

  const url = new URL(file.name, new URL(baseUrl, globalThis.location?.href)).href;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  const bytes = await res.arrayBuffer();

  const digest = await sha256Hex(bytes);
  if (digest !== file.sha256) {
    throw new Error(`${file.name} from ${url} failed SHA-256 verification (got ${digest})`);
  }

  await cachePut(file.cacheKey, bytes).catch(() => {}); // caching is best-effort
  return bytes;
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function cacheGet(key) {
  try {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const req = db.transaction(STORE).objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return undefined;
  }
}

async function cachePut(key, bytes) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(bytes, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
