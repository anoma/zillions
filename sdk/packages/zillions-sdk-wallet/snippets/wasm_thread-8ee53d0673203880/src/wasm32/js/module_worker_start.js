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
