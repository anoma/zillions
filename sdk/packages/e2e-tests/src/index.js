import initWasm, * as ZillionsWallet from '@zillions/sdk/wallet';
import { initThreadPool, WebWallet } from '@zillions/sdk/wallet';
import initKeys, * as ZillionsKeys from '@zillions/sdk/keys';
import initRequests, * as ZillionsRequests from '@zillions/sdk/requests';

window.ZillionsWallet = ZillionsWallet;
window.ZillionsKeys = ZillionsKeys;
window.ZillionsRequests = ZillionsRequests;

const N_THREADS = 10;
const MAINNET_LIGHTWALLETD_PROXY = 'https://zcash-mainnet.chainsafe.dev';

async function loadPage() {
  await new Promise((resolve) => {
    window.addEventListener('load', resolve);
  });

  // Code to executed once the page has loaded
  await initWasm();
  await initKeys();
  await initRequests();
  await initThreadPool(N_THREADS);

  window.webWallet = new WebWallet('main', MAINNET_LIGHTWALLETD_PROXY, 1, 1, null);
  window.initialized = true;
  console.log('WebWallet initialized');
  console.log(webWallet);
}

loadPage();
