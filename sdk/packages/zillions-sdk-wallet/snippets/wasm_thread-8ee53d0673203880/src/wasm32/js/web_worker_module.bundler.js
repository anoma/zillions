let _resolveWalletUrl;
const _walletUrlReady = new Promise(resolve => { _resolveWalletUrl = resolve; });

self.onmessage = async function(event) {
    const data = event.data;

    if (data?.type === '__wallet_init') {
        _resolveWalletUrl(data.walletUrl);
        return;
    }

    // Ignore unknown messages (e.g. Vite's module-runner init in dev mode)
    if (!Array.isArray(data)) return;

    const walletUrl = await _walletUrlReady;
    const [module, memory, work, thread_key] = data;
    const { default: init, wasm_thread_entry_point } = await import(/* @vite-ignore */ walletUrl);
    init(module, memory).catch(err => {
        console.log(err);
        const error = new Error(err.message);
        error.customProperty = "This error right here!";
        setTimeout(() => { throw error; });
        throw error;
    }).then(() => {
        wasm_thread_entry_point(work);
    });
};

self.onunhandledrejection = function(e) {
    console.error('Worker unhandled rejection:', e.reason);
    throw e.reason;
};
self.onerror = function(e) {
    console.error('Worker error:', e.message);
    throw e;
};
self.onended = function(e) {
    console.error('Worker ended:', e.message);
    throw e;
};
