/**
 * Zillions test dApp — vanilla JS harness for the extension's approvals flow.
 *
 * The extension's content script injects `window.zc` (the InjectedZillions
 * provider) into every page's MAIN world. We poll for it, then drive the
 * connection lifecycle: connect -> account -> switchAccount -> disconnect.
 *
 * Everything is logged to the on-page panel so the approvals popup can be
 * exercised and inspected without opening devtools.
 */
import "./style.css";

const els = {
  providerDot: document.getElementById("providerDot"),
  providerStatus: document.getElementById("providerStatus"),
  connDot: document.getElementById("connDot"),
  connStatus: document.getElementById("connStatus"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  switchBtn: document.getElementById("switchBtn"),
  accountsCard: document.getElementById("accountsCard"),
  defaultAccount: document.getElementById("defaultAccount"),
  accountsList: document.getElementById("accountsList"),
  signCard: document.getElementById("signCard"),
  pcztInput: document.getElementById("pcztInput"),
  signerSelect: document.getElementById("signerSelect"),
  signBtn: document.getElementById("signBtn"),
  signedWrap: document.getElementById("signedWrap"),
  signedOutput: document.getElementById("signedOutput"),
  copySignedBtn: document.getElementById("copySignedBtn"),
  signArbCard: document.getElementById("signArbCard"),
  arbInput: document.getElementById("arbInput"),
  arbSignerSelect: document.getElementById("arbSignerSelect"),
  signArbBtn: document.getElementById("signArbBtn"),
  arbResultWrap: document.getElementById("arbResultWrap"),
  arbPubkey: document.getElementById("arbPubkey"),
  arbHash: document.getElementById("arbHash"),
  arbSig: document.getElementById("arbSig"),
  verifyArbBtn: document.getElementById("verifyArbBtn"),
  arbVerifyResult: document.getElementById("arbVerifyResult"),
  log: document.getElementById("log"),
  clearLogBtn: document.getElementById("clearLogBtn"),
};

// ---- logging ----------------------------------------------------------------

function log(message, kind = "") {
  const ts = new Date().toLocaleTimeString();
  const line = document.createElement("span");
  line.innerHTML =
    `<span class="t">${ts}</span> ` +
    `<span class="${kind}">${escapeHtml(message)}</span>\n`;
  els.log.appendChild(line);
  els.log.scrollTop = els.log.scrollHeight;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}

/** Wrap a provider call so every request/result/error lands in the log. */
async function call(label, fn) {
  log(`→ ${label}`, "call");
  try {
    const result = await fn();
    log(`✓ ${label} → ${result === undefined ? "ok" : JSON.stringify(result)}`, "ok");
    return result;
  } catch (err) {
    log(`✗ ${label} → ${err && err.message ? err.message : String(err)}`, "err");
    throw err;
  }
}

els.clearLogBtn.addEventListener("click", () => (els.log.textContent = ""));

// ---- provider detection -----------------------------------------------------

function waitForProvider(timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (window.zc) return resolve(window.zc);
    const start = Date.now();
    const timer = setInterval(() => {
      if (window.zc) {
        clearInterval(timer);
        resolve(window.zc);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, 100);
  });
}

// ---- UI state ---------------------------------------------------------------

function setProvider(found) {
  els.providerDot.className = `dot ${found ? "ok" : "err"}`;
  els.providerStatus.textContent = found
    ? `window.zc detected (v${safeVersion()})`
    : "window.zc NOT found — is the extension installed & enabled?";
  els.connectBtn.disabled = !found;
}

function safeVersion() {
  try {
    return window.zc.version() || "?";
  } catch {
    return "?";
  }
}

function setConnected(connected) {
  els.connDot.className = `dot ${connected ? "ok" : ""}`;
  els.connStatus.textContent = connected ? "connected" : "disconnected";
  els.disconnectBtn.disabled = !connected;
  els.refreshBtn.disabled = !connected;
  els.switchBtn.disabled = !connected;
  els.accountsCard.style.display = connected ? "block" : "none";
  els.signCard.style.display = connected ? "block" : "none";
  els.signArbCard.style.display = connected ? "block" : "none";
  if (!connected) {
    els.defaultAccount.textContent = "—";
    els.accountsList.innerHTML = "";
    els.signerSelect.length = 1; // keep the "Active account" default
    els.signedWrap.style.display = "none";
    els.arbSignerSelect.length = 0;
    els.arbResultWrap.style.display = "none";
  }
}

function renderAccounts(accounts, defaultAccount) {
  els.defaultAccount.textContent = defaultAccount
    ? `${defaultAccount.alias} · ${defaultAccount.address}`
    : "(none set)";

  els.accountsList.innerHTML = "";
  if (!accounts || accounts.length === 0) {
    els.accountsList.innerHTML = `<div class="account mono">(no accounts)</div>`;
    return;
  }
  for (const a of accounts) {
    const row = document.createElement("div");
    row.className = "account";
    row.innerHTML =
      `<div class="row" style="justify-content: space-between">` +
      `<strong>${escapeHtml(a.alias || "(unnamed)")}</strong>` +
      `<span class="badge">${escapeHtml(a.type)}</span></div>` +
      `<div class="mono" style="margin-top:4px">${escapeHtml(a.address)}</div>`;

    els.accountsList.appendChild(row);
  }

  // Refill the signer dropdown, preserving the "Active account" default option.
  const previous = els.signerSelect.value;
  els.signerSelect.length = 1;
  for (const a of accounts || []) {
    const opt = document.createElement("option");
    opt.value = a.address;
    opt.textContent = `${a.alias || "(unnamed)"} · ${a.address.slice(0, 16)}…`;
    els.signerSelect.appendChild(opt);
  }
  els.signerSelect.value = previous; // no-op if the address is gone

  // signArbitrary requires an explicit signer — list account addresses.
  const prevArb = els.arbSignerSelect.value;
  els.arbSignerSelect.length = 0;
  for (const a of accounts || []) {
    const opt = document.createElement("option");
    opt.value = a.address;
    opt.textContent = `${a.alias || "(unnamed)"} · ${a.address.slice(0, 16)}…`;
    els.arbSignerSelect.appendChild(opt);
  }
  if (prevArb) els.arbSignerSelect.value = prevArb;
}

// ---- actions ----------------------------------------------------------------

async function loadAccounts() {
  const account = await call("zc.account()", () => window.zc.account());
  renderAccounts(
    account ? [account.transparent, account.shielded] : [],
    account?.transparent
  );
}

els.connectBtn.addEventListener("click", async () => {
  els.connectBtn.disabled = true;
  try {
    await call("zc.connect()", () => window.zc.connect());
    setConnected(true);
    await loadAccounts();
  } catch {
    // already logged
  } finally {
    els.connectBtn.disabled = false;
  }
});

els.disconnectBtn.addEventListener("click", async () => {
  try {
    await call("zc.disconnect()", () => window.zc.disconnect());
    setConnected(false);
  } catch {
    // already logged
  }
});

els.refreshBtn.addEventListener("click", () => loadAccounts().catch(() => {}));
els.switchBtn.addEventListener("click", () => void switchAccount());

let lastArbResult = null; // { hash, signature, publicKey } from the last sign

els.signArbBtn.addEventListener("click", async () => {
  const data = els.arbInput.value;
  const signer = els.arbSignerSelect.value;
  if (!signer) {
    log("✗ signArbitrary: connect first / pick a signer.", "err");
    return;
  }
  els.signArbBtn.disabled = true;
  els.arbResultWrap.style.display = "none";
  els.arbVerifyResult.textContent = "";
  try {
    const res = await call(
      `zc.signArbitrary({ signer: ${signer.slice(0, 12)}…, data })`,
      () => window.zc.signArbitrary({ signer, data })
    );
    lastArbResult = res || null;
    els.arbPubkey.textContent = res?.publicKey ?? "(not returned)";
    els.arbHash.textContent = res?.hash ?? "—";
    els.arbSig.textContent = res?.signature ?? "—";
    els.arbResultWrap.style.display = "block";
  } catch {
    // already logged
  } finally {
    els.signArbBtn.disabled = false;
  }
});

els.verifyArbBtn.addEventListener("click", async () => {
  if (!lastArbResult) return;
  const { publicKey, hash, signature } = lastArbResult;
  if (!publicKey) {
    log("✗ verify: no public key from signArbitrary to verify against.", "err");
    return;
  }
  try {
    await call("zc.verify({ publicKey, hash, signature })", () =>
      window.zc.verify({ publicKey, hash, signature })
    );
    els.arbVerifyResult.textContent = "✓ valid";
    els.arbVerifyResult.className = "mono ok";
  } catch (err) {
    els.arbVerifyResult.textContent = "✗ invalid";
    els.arbVerifyResult.className = "mono err";
  }
});

/** Drive the switchAccount picker, then refresh the account view. */
async function switchAccount() {
  try {
    await call("zc.switchAccount()", () => window.zc.switchAccount());
    await loadAccounts();
  } catch {
    // already logged
  }
}

els.signBtn.addEventListener("click", async () => {
  const pczt = els.pcztInput.value.trim();
  if (!pczt) {
    log("✗ Sign: paste a base64 PCZT first.", "err");
    return;
  }
  const signer = els.signerSelect.value || undefined;
  const props = signer ? { pczt, signer } : { pczt };

  els.signBtn.disabled = true;
  els.signedWrap.style.display = "none";
  try {
    const signed = await call(
      `zc.sign({ pczt: …${pczt.length}b, signer: ${signer ?? "active"} })`,
      () => window.zc.sign(props)
    );
    els.signedOutput.value = signed ?? "";
    els.signedWrap.style.display = "block";
  } catch {
    // already logged
  } finally {
    els.signBtn.disabled = false;
  }
});

els.copySignedBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(els.signedOutput.value);
    log("Copied signed PCZT to clipboard.");
  } catch (err) {
    log(`Copy failed: ${err && err.message ? err.message : String(err)}`, "err");
  }
});

// ---- wallet events ----------------------------------------------------------

/** The keychain dispatches these DOM events on the page (see @zillions/types Events). */
const WALLET_EVENTS = {
  "zc-account-changed": "accountChanged",
  "zc-extension-locked": "locked",
  "zc-extension-unlocked": "unlocked",
  "zc-connection-revoked": "connectionRevoked",
};

function registerWalletEvents() {
  for (const [name, label] of Object.entries(WALLET_EVENTS)) {
    window.addEventListener(name, () => {
      log(`★ event: ${label} (${name})`, "ok");
      // React the way a real dapp would: re-check connection + accounts.
      window.zc
        .isConnected()
        .then((connected) => {
          setConnected(connected);
          if (connected) return loadAccounts();
        })
        .catch(() => setConnected(false));
    });
  }
}

// ---- bootstrap --------------------------------------------------------------

(async function init() {
  log(`origin: ${window.location.origin}`);
  const zc = await waitForProvider();
  setProvider(Boolean(zc));
  if (!zc) {
    log("Provider not injected. Open this page on http://localhost (not file://) and reload.", "err");
    return;
  }
  registerWalletEvents();
  log("Provider ready. Checking existing connection…");
  try {
    const connected = await call("zc.isConnected()", () => window.zc.isConnected());
    setConnected(connected);
    if (connected) await loadAccounts();
  } catch {
    setConnected(false);
  }
})();
