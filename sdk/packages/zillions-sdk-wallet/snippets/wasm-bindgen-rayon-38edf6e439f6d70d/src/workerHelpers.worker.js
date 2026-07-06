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
